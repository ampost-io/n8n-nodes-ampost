import type {
	IDataObject,
	IExecuteFunctions,
	IHookFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	IWebhookFunctions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

export type AmpostContext =
	| IExecuteFunctions
	| ILoadOptionsFunctions
	| IHookFunctions
	| IWebhookFunctions;

export const CREDENTIAL_NAME = 'ampostApi';

/** Largest page the API serves. */
const PAGE_SIZE = 100;

interface ApiErrorBody {
	error?: { code?: string; message?: string; details?: unknown };
}

export interface AmpostRequest {
	method: IHttpRequestMethods;
	path: string;
	body?: IDataObject;
	qs?: IDataObject;
	idempotencyKey?: string;
}

export async function getBaseUrl(this: AmpostContext): Promise<string> {
	const credentials = await this.getCredentials(CREDENTIAL_NAME);
	const baseUrl =
		typeof credentials.baseUrl === 'string' && credentials.baseUrl
			? credentials.baseUrl
			: 'https://api.ampost.io';
	return baseUrl.replace(/\/+$/, '');
}

/** Drops empty values, so an unset filter is not sent as `?status=`. */
export function compact(values: IDataObject): IDataObject {
	const result: IDataObject = {};
	for (const [key, value] of Object.entries(values)) {
		if (value === undefined || value === null || value === '') continue;
		if (Array.isArray(value) && value.length === 0) continue;
		result[key] = value;
	}
	return result;
}

/**
 * One call to the Ampost REST API. Errors come back as
 * `{ error: { code, message, details } }`; they are thrown as NodeApiError
 * with Ampost's message and code, so the n8n error panel shows them.
 */
export async function ampostApiRequest(
	this: AmpostContext,
	request: AmpostRequest,
): Promise<IDataObject> {
	const baseUrl = await getBaseUrl.call(this);
	const options: IHttpRequestOptions = {
		method: request.method,
		url: `${baseUrl}${request.path}`,
		json: true,
		returnFullResponse: true,
		ignoreHttpStatusErrors: true,
		headers: { Accept: 'application/json', 'User-Agent': 'n8n-nodes-ampost' },
	};
	if (request.qs && Object.keys(request.qs).length > 0) options.qs = request.qs;
	if (request.body !== undefined) options.body = request.body;
	if (request.idempotencyKey) options.headers!['Idempotency-Key'] = request.idempotencyKey;

	const response = (await this.helpers.httpRequestWithAuthentication.call(
		this,
		CREDENTIAL_NAME,
		options,
	)) as {
		statusCode: number;
		body: unknown;
	};

	if (response.statusCode >= 200 && response.statusCode < 300) {
		return (response.body ?? {}) as IDataObject;
	}

	const body = (
		typeof response.body === 'object' && response.body !== null ? response.body : {}
	) as ApiErrorBody;
	const code = body.error?.code;
	const message = body.error?.message ?? `Ampost answered HTTP ${response.statusCode}`;
	throw new NodeApiError(this.getNode(), (response.body ?? {}) as JsonObject, {
		message: code ? `${message} (${code})` : message,
		description: describeError(code, body.error?.details),
		httpCode: String(response.statusCode),
	});
}

function describeError(code: string | undefined, details: unknown): string | undefined {
	const hints: Record<string, string> = {
		INSUFFICIENT_SCOPE:
			'The API key lacks the scope this operation needs. Edit the key in Ampost under Setup → API keys.',
		PLATFORM_SET_NOT_ALLOWED: 'The API key is restricted to other platform sets.',
		UPGRADE_REQUIRED: 'This feature needs a paid Ampost plan.',
		QUOTA_EXCEEDED: "The plan's monthly API requests are used up.",
		RATE_LIMITED:
			'Too many requests. Wait and try again, or turn on Retry On Fail in the node settings.',
		IDEMPOTENCY_KEY_REUSED:
			'This idempotency key was used for a different request in the last 24 hours. Use a key that is unique to each post.',
	};
	const hint = code ? hints[code] : undefined;
	const detailText = details === undefined ? undefined : JSON.stringify(details);
	if (hint && detailText) return `${hint} Details: ${detailText}`;
	return hint ?? detailText;
}

/** Every item of a paginated list (`{ data, pagination: { hasMore } }`). */
export async function ampostApiRequestAllItems(
	this: AmpostContext,
	path: string,
	qs: IDataObject = {},
	max = Infinity,
): Promise<IDataObject[]> {
	const items: IDataObject[] = [];
	let offset = 0;
	for (;;) {
		const limit = Math.min(PAGE_SIZE, max - items.length);
		const page = await ampostApiRequest.call(this, {
			method: 'GET',
			path,
			qs: { ...qs, limit, offset },
		});
		const data = Array.isArray(page.data) ? (page.data as IDataObject[]) : [];
		items.push(...data);
		const pagination = (page.pagination ?? {}) as IDataObject;
		if (!pagination.hasMore || data.length === 0 || items.length >= max) return items;
		offset += data.length;
	}
}
