import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError, sleep } from 'n8n-workflow';
import { buildPlatformOptions } from './descriptions/platformOptions';
import { ampostApiRequest, ampostApiRequestAllItems, compact } from './transport';

/** What the media upload accepts (`limits.mimeTypes` of POST /api/media/uploads). */
export const ACCEPTED_MIME_TYPES = [
	'image/jpeg',
	'image/png',
	'image/webp',
	'video/mp4',
	'video/quicktime',
	'video/webm',
];

const POLL_INTERVAL_MS = 3000;

type Result = IDataObject | IDataObject[];

function parseJson(
	ctx: IExecuteFunctions,
	value: unknown,
	field: string,
	itemIndex: number,
): unknown {
	if (typeof value !== 'string') return value;
	if (value.trim() === '') return undefined;
	try {
		return JSON.parse(value);
	} catch {
		throw new NodeOperationError(ctx.getNode(), `${field} is not valid JSON`, { itemIndex });
	}
}

function toList(value: unknown): string[] {
	if (Array.isArray(value)) return value.map(String).filter((entry) => entry.length > 0);
	if (typeof value === 'string') {
		return value
			.split(',')
			.map((entry) => entry.trim())
			.filter((entry) => entry.length > 0);
	}
	return [];
}

const OFFSET_PATTERN = /(Z|[+-]\d{2}:?\d{2})$/i;

/** Milliseconds `zone` is ahead of UTC at `timestamp`. */
function zoneOffset(timestamp: number, zone: string): number {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone: zone,
		hourCycle: 'h23',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
	}).formatToParts(new Date(timestamp));
	const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
	const asUtc = Date.UTC(
		get('year'),
		get('month') - 1,
		get('day'),
		get('hour'),
		get('minute'),
		get('second'),
	);
	return asUtc - Math.floor(timestamp / 1000) * 1000;
}

/**
 * The API wants an absolute ISO time. n8n's date picker gives a wall-clock
 * time without an offset, meant in the workflow's time zone.
 */
export function toIsoTime(value: string, zone: string): string | null {
	const trimmed = value.trim();
	if (OFFSET_PATTERN.test(trimmed)) {
		const parsed = Date.parse(trimmed);
		return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
	}
	const wallClock = Date.parse(`${trimmed}Z`);
	if (Number.isNaN(wallClock)) return null;
	let utc = wallClock - zoneOffset(wallClock, zone);
	utc = wallClock - zoneOffset(utc, zone);
	return new Date(utc).toISOString();
}

function mediaItems(ctx: IExecuteFunctions, fields: IDataObject, itemIndex: number): IDataObject[] {
	const items: IDataObject[] = [];
	const fixed = ((fields.media as IDataObject | undefined)?.items ?? []) as IDataObject[];
	for (const item of fixed) {
		if (!item.url) continue;
		items.push(compact({ url: item.url, type: item.type, altText: item.altText }));
	}
	const fromJson = parseJson(ctx, fields.mediaJson, 'Media Items (JSON)', itemIndex);
	if (fromJson !== undefined) {
		const list = Array.isArray(fromJson) ? fromJson : [fromJson];
		for (const entry of list) {
			if (typeof entry !== 'object' || entry === null) {
				throw new NodeOperationError(
					ctx.getNode(),
					'Media Items (JSON) must be an array of objects with url and type',
					{
						itemIndex,
					},
				);
			}
			items.push(entry as IDataObject);
		}
	}
	return items;
}

/** The body of POST /api/posts (and /validate) from the node's fields. */
export function buildPostBody(ctx: IExecuteFunctions, itemIndex: number): IDataObject {
	if (ctx.getNodeParameter('inputMode', itemIndex, 'fields') === 'json') {
		const body = parseJson(
			ctx,
			ctx.getNodeParameter('jsonBody', itemIndex),
			'Post (JSON)',
			itemIndex,
		);
		if (typeof body !== 'object' || body === null || Array.isArray(body)) {
			throw new NodeOperationError(ctx.getNode(), 'Post (JSON) must be a JSON object', {
				itemIndex,
			});
		}
		return body as IDataObject;
	}

	const platforms = toList(ctx.getNodeParameter('platforms', itemIndex, []));
	if (platforms.length === 0) {
		throw new NodeOperationError(ctx.getNode(), 'Choose at least one platform', { itemIndex });
	}
	const platformSetId = ctx.getNodeParameter('platformSetId', itemIndex, '') as string;
	const fields = ctx.getNodeParameter('additionalFields', itemIndex, {}) as IDataObject;

	const targets: IDataObject[] = [compact({ platformSetId, platforms })];
	for (const extra of ((fields.extraTargets as IDataObject | undefined)?.targets ??
		[]) as IDataObject[]) {
		const extraPlatforms = toList(extra.platforms);
		if (extraPlatforms.length > 0)
			targets.push(compact({ platformSetId: extra.platformSetId, platforms: extraPlatforms }));
	}

	const body: IDataObject = {
		targets,
		text: ctx.getNodeParameter('text', itemIndex, '') as string,
	};

	switch (ctx.getNodeParameter('publishMode', itemIndex, 'now') as string) {
		case 'now':
			body.publishNow = true;
			break;
		case 'queue':
			body.useQueue = true;
			break;
		case 'schedule': {
			const raw = ctx.getNodeParameter('scheduledFor', itemIndex, '') as string;
			const scheduledFor = toIsoTime(String(raw), ctx.getTimezone());
			if (!scheduledFor) {
				throw new NodeOperationError(
					ctx.getNode(),
					`Scheduled For is not a valid date: ${String(raw)}`,
					{ itemIndex },
				);
			}
			body.scheduledFor = scheduledFor;
			break;
		}
	}

	if (fields.firstComment) body.firstComment = fields.firstComment;
	if (fields.linkUrl) body.linkUrl = fields.linkUrl;
	if (fields.mediaFit) body.mediaFit = fields.mediaFit;
	const media = mediaItems(ctx, fields, itemIndex);
	if (media.length > 0) body.media = media;

	const metadata = parseJson(ctx, fields.metadata, 'Metadata (JSON)', itemIndex);
	if (metadata !== undefined) {
		if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) {
			throw new NodeOperationError(ctx.getNode(), 'Metadata (JSON) must be a JSON object', {
				itemIndex,
			});
		}
		if (Object.keys(metadata).length > 0) body.metadata = metadata as IDataObject;
	}

	const options = buildPlatformOptions(
		ctx.getNodeParameter('platformOptions', itemIndex, {}) as IDataObject,
	);
	if (Object.keys(options).length > 0) body.options = options;

	return body;
}

async function list(
	ctx: IExecuteFunctions,
	path: string,
	qs: IDataObject,
	itemIndex: number,
): Promise<IDataObject[]> {
	const returnAll = ctx.getNodeParameter('returnAll', itemIndex, false) as boolean;
	const limit = returnAll ? Infinity : (ctx.getNodeParameter('limit', itemIndex, 50) as number);
	return ampostApiRequestAllItems.call(ctx, path, compact(qs), limit);
}

const postPath = (ctx: IExecuteFunctions, itemIndex: number, suffix = '') =>
	`/api/posts/${encodeURIComponent(ctx.getNodeParameter('postId', itemIndex) as string)}${suffix}`;

async function runPost(ctx: IExecuteFunctions, operation: string, i: number): Promise<Result> {
	switch (operation) {
		case 'create': {
			const body = buildPostBody(ctx, i);
			const fields = ctx.getNodeParameter('additionalFields', i, {}) as IDataObject;
			const idempotencyKey = (fields.idempotencyKey as string | undefined) || undefined;
			return ampostApiRequest.call(ctx, {
				method: 'POST',
				path: '/api/posts',
				body,
				idempotencyKey,
			});
		}
		case 'validate':
			return ampostApiRequest.call(ctx, {
				method: 'POST',
				path: '/api/posts/validate',
				body: buildPostBody(ctx, i),
			});
		case 'get':
			return ampostApiRequest.call(ctx, { method: 'GET', path: postPath(ctx, i) });
		case 'getAll':
			return list(ctx, '/api/posts', ctx.getNodeParameter('filters', i, {}) as IDataObject, i);
		case 'publish':
			return ampostApiRequest.call(ctx, {
				method: 'POST',
				path: postPath(ctx, i, '/publish'),
				idempotencyKey: (ctx.getNodeParameter('idempotencyKey', i, '') as string) || undefined,
			});
		case 'retry': {
			const accountIds = toList(ctx.getNodeParameter('accountIds', i, []));
			return ampostApiRequest.call(ctx, {
				method: 'POST',
				path: postPath(ctx, i, '/retry'),
				body: accountIds.length > 0 ? { accountIds } : {},
				idempotencyKey: (ctx.getNodeParameter('idempotencyKey', i, '') as string) || undefined,
			});
		}
		case 'delete':
			return ampostApiRequest.call(ctx, { method: 'DELETE', path: postPath(ctx, i) });
		case 'unpublish': {
			const accountIds = toList(ctx.getNodeParameter('accountIds', i, []));
			return ampostApiRequest.call(ctx, {
				method: 'POST',
				path: postPath(ctx, i, '/unpublish'),
				body: accountIds.length > 0 ? { accountIds } : {},
			});
		}
		case 'editPublished': {
			const text = ctx.getNodeParameter('newText', i) as string;
			if (!text.trim()) {
				throw new NodeOperationError(ctx.getNode(), 'New Text is empty', { itemIndex: i });
			}
			const accountIds = toList(ctx.getNodeParameter('accountIds', i, []));
			return ampostApiRequest.call(ctx, {
				method: 'POST',
				path: postPath(ctx, i, '/edit-published'),
				body: accountIds.length > 0 ? { text, accountIds } : { text },
			});
		}
	}
	throw new NodeOperationError(ctx.getNode(), `Unknown post operation: ${operation}`, {
		itemIndex: i,
	});
}

async function uploadMedia(ctx: IExecuteFunctions, i: number): Promise<IDataObject> {
	const binaryPropertyName = ctx.getNodeParameter('binaryPropertyName', i) as string;
	const options = ctx.getNodeParameter('options', i, {}) as IDataObject;
	const binary = ctx.helpers.assertBinaryData(i, binaryPropertyName);
	const mimeType = (binary.mimeType || '').toLowerCase().split(';')[0].trim();
	if (!ACCEPTED_MIME_TYPES.includes(mimeType)) {
		throw new NodeOperationError(
			ctx.getNode(),
			`Ampost does not accept ${mimeType || 'files without a MIME type'}. Accepted: ${ACCEPTED_MIME_TYPES.join(', ')}.`,
			{ itemIndex: i },
		);
	}
	const fileName = (options.fileName as string) || binary.fileName || 'upload';
	const buffer = await ctx.helpers.getBinaryDataBuffer(i, binaryPropertyName);

	const upload = await ampostApiRequest.call(ctx, {
		method: 'POST',
		path: '/api/media/uploads',
		body: { fileName },
	});
	await ctx.helpers.httpRequest({
		method: ((upload.method as string) || 'PUT') as 'PUT',
		url: upload.uploadUrl as string,
		headers: { ...(upload.headers as IDataObject), 'x-content-type': mimeType },
		body: buffer,
		json: false,
	});

	const deadline = Date.now() + ((options.waitTimeout as number) || 60) * 1000;
	const statusPath = `/api/media/uploads/${encodeURIComponent(String(upload.id))}`;
	for (;;) {
		const status = await ampostApiRequest.call(ctx, { method: 'GET', path: statusPath });
		if (status.status === 'completed') return status;
		if (status.status === 'failed' || status.status === 'expired') {
			throw new NodeOperationError(
				ctx.getNode(),
				`The upload ${String(status.status)}${status.error ? `: ${String(status.error)}` : ''}`,
				{ itemIndex: i },
			);
		}
		if (Date.now() >= deadline) {
			throw new NodeOperationError(
				ctx.getNode(),
				'Ampost did not finish checking the file in time',
				{
					itemIndex: i,
					description:
						'Raise Wait Timeout under Options, or read the upload later with its ID: ' +
						String(upload.id),
				},
			);
		}
		await sleep(POLL_INTERVAL_MS);
	}
}

/** Runs one operation for one input item. Lists come back as arrays, one n8n item each. */
export async function runOperation(
	ctx: IExecuteFunctions,
	resource: string,
	operation: string,
	i: number,
): Promise<Result> {
	switch (resource) {
		case 'post':
			return runPost(ctx, operation, i);
		case 'account':
			if (operation === 'get' || operation === 'disconnect') {
				const accountId = ctx.getNodeParameter('accountId', i) as string;
				return ampostApiRequest.call(ctx, {
					method: operation === 'get' ? 'GET' : 'DELETE',
					path: `/api/accounts/${encodeURIComponent(accountId)}`,
				});
			}
			return list(ctx, '/api/accounts', ctx.getNodeParameter('filters', i, {}) as IDataObject, i);
		case 'media':
			return uploadMedia(ctx, i);
		case 'platformSet':
			return list(ctx, '/api/platform-sets', {}, i);
		case 'queue': {
			const platformSetId = ctx.getNodeParameter('platformSetId', i) as string;
			const result = await ampostApiRequest.call(ctx, {
				method: 'GET',
				path: `/api/platform-sets/${encodeURIComponent(platformSetId)}/queue/slots`,
				qs: {
					count: ctx.getNodeParameter('count', i, 10) as number,
					filter: ctx.getNodeParameter('onlyFree', i, false) ? 'free' : 'all',
				},
			});
			const slots = (Array.isArray(result.slots) ? result.slots : []) as IDataObject[];
			return slots.map((slot) => ({
				...slot,
				platformSetId: result.platformSetId,
				timezone: result.timezone,
			}));
		}
		case 'analytics': {
			const filters = { ...(ctx.getNodeParameter('filters', i, {}) as IDataObject) };
			if (operation === 'getOverview') {
				for (const key of ['from', 'to']) {
					if (filters[key]) filters[key] = String(filters[key]).slice(0, 10);
				}
				return ampostApiRequest.call(ctx, {
					method: 'GET',
					path: '/api/analytics/overview',
					qs: compact(filters),
				});
			}
			return list(ctx, '/api/analytics/posts', filters, i);
		}
	}
	throw new NodeOperationError(ctx.getNode(), `Unknown resource: ${resource}`, { itemIndex: i });
}
