import type { IDataObject, INodeProperties } from 'n8n-workflow';

/**
 * Fields whose API value is a list of objects (threads, Instagram user tags,
 * Discord embeds) or one object (a Discord poll): fixedCollections in the UI,
 * converted to the API's shape here.
 */

/** Reports bad input in one of these fields; actions.ts throws a NodeOperationError. */
export type Fail = (message: string) => never;

type Base = Pick<INodeProperties, 'displayName' | 'name' | 'description'>;

const MEDIA_TYPE_OPTIONS = [
	{ name: 'Image', value: 'image' },
	{ name: 'Video', value: 'video' },
];

function parseJsonArray(value: unknown, label: string, fail: Fail): IDataObject[] {
	if (value === undefined || value === null || value === '') return [];
	let parsed = value;
	if (typeof value === 'string') {
		try {
			parsed = JSON.parse(value);
		} catch {
			return fail(`${label} is not valid JSON`);
		}
	}
	const list = Array.isArray(parsed) ? parsed : [parsed];
	for (const entry of list) {
		if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
			fail(`${label} must be an array of objects`);
		}
	}
	return list as IDataObject[];
}

const entries = (value: unknown, key: string): IDataObject[] => {
	const list = (value as IDataObject | undefined)?.[key];
	if (Array.isArray(list)) return list as IDataObject[];
	if (list && typeof list === 'object') return [list as IDataObject];
	return [];
};

const isSet = (value: unknown) => value !== undefined && value !== null && value !== '';

// ---- Thread (top-level `thread` and `options.<platform>.thread`) ----

export function threadProperty(base: Base): INodeProperties {
	return {
		...base,
		type: 'fixedCollection',
		placeholder: 'Add Thread Post',
		typeOptions: { multipleValues: true, sortable: true },
		default: {},
		options: [
			{
				displayName: 'Thread Post',
				name: 'items',
				values: [
					{
						displayName: 'Media Alt Text',
						name: 'altText',
						type: 'string',
						default: '',
						description: 'Image description for screen readers',
					},
					{
						displayName: 'Media Type',
						name: 'mediaType',
						type: 'options',
						options: MEDIA_TYPE_OPTIONS,
						default: 'image',
					},
					{
						displayName: 'Media URL',
						name: 'mediaUrl',
						type: 'string',
						default: '',
						placeholder: 'https://example.com/photo.jpg',
						description: 'Image or video at a public https URL. Empty: no media.',
					},
					{
						displayName: 'More Media (JSON)',
						name: 'mediaJson',
						type: 'json',
						default: '',
						description:
							'More media of this post as a JSON array of objects with URL, type and alt text, after Media URL',
					},
					{
						displayName: 'Text',
						name: 'text',
						type: 'string',
						typeOptions: { rows: 3 },
						default: '',
						description: 'Text of this follow-up post',
					},
				],
			},
		],
	};
}

/** `{ items: [{ text, mediaUrl, ... }] }` → `[{ text, media: [...] }]`. */
export function toThreadItems(value: unknown, label: string, fail: Fail): IDataObject[] {
	return entries(value, 'items').map((item) => {
		const media: IDataObject[] = [];
		if (isSet(item.mediaUrl)) {
			const entry: IDataObject = { url: item.mediaUrl, type: item.mediaType || 'image' };
			if (isSet(item.altText)) entry.altText = item.altText;
			media.push(entry);
		}
		media.push(...parseJsonArray(item.mediaJson, `${label}: More Media (JSON)`, fail));
		const result: IDataObject = { text: (item.text as string | undefined) ?? '' };
		if (media.length > 0) result.media = media;
		return result;
	});
}

// ---- Instagram user tags ----

function userTagsProperty(base: Base): INodeProperties {
	return {
		...base,
		type: 'fixedCollection',
		placeholder: 'Add User Tag',
		typeOptions: { multipleValues: true },
		default: {},
		options: [
			{
				displayName: 'Tag',
				name: 'tags',
				values: [
					{
						displayName: 'Username',
						name: 'username',
						type: 'string',
						default: '',
						description: 'Instagram username, without @',
					},
					{
						displayName: 'X',
						name: 'x',
						type: 'string',
						default: '',
						placeholder: '0.5',
						description: 'From the left, 0-1. Required on images, empty on reels.',
					},
					{
						displayName: 'Y',
						name: 'y',
						type: 'string',
						default: '',
						placeholder: '0.5',
						description: 'From the top, 0-1. Required on images, empty on reels.',
					},
					{
						displayName: 'Media Index',
						name: 'mediaIndex',
						type: 'number',
						typeOptions: { minValue: 0 },
						default: 0,
						description: 'Media item the tag is on, 0-based',
					},
				],
			},
		],
	};
}

function toUserTags(value: unknown, label: string, fail: Fail): IDataObject[] {
	return entries(value, 'tags')
		.filter((tag) => isSet(tag.username))
		.map((tag) => {
			const result: IDataObject = { username: String(tag.username).trim().replace(/^@/, '') };
			for (const axis of ['x', 'y'] as const) {
				if (!isSet(tag[axis])) continue;
				const number = Number(tag[axis]);
				if (Number.isNaN(number)) {
					fail(`${label}: ${axis.toUpperCase()} must be a number from 0 to 1`);
				}
				result[axis] = number;
			}
			if (typeof tag.mediaIndex === 'number' && tag.mediaIndex > 0) {
				result.mediaIndex = tag.mediaIndex;
			}
			return result;
		});
}

// ---- Discord embeds ----

function embedsProperty(base: Base): INodeProperties {
	return {
		...base,
		type: 'fixedCollection',
		placeholder: 'Add Embed',
		typeOptions: { multipleValues: true, sortable: true },
		default: {},
		options: [
			{
				displayName: 'Embed',
				name: 'embeds',
				values: [
					{
						displayName: 'Color',
						name: 'color',
						type: 'color',
						default: '',
						placeholder: '#5865F2',
						description: 'Stripe color of the embed',
					},
					{
						displayName: 'Description',
						name: 'description',
						type: 'string',
						typeOptions: { rows: 3 },
						default: '',
						description: 'Embed text',
					},
					{
						displayName: 'Fields (JSON)',
						name: 'fieldsJson',
						type: 'json',
						default: '',
						placeholder: '[{ "name": "Price", "value": "$9", "inline": true }]',
						description:
							'Name and value pairs as a JSON array of { "name", "value", "inline" }, up to 25',
					},
					{
						displayName: 'Image URL',
						name: 'imageUrl',
						type: 'string',
						default: '',
						description: 'Image under the embed (Discord fetches it)',
					},
					{
						displayName: 'Title',
						name: 'title',
						type: 'string',
						default: '',
						description: 'Embed title',
					},
					{
						displayName: 'URL',
						name: 'url',
						type: 'string',
						default: '',
						description: 'Title link',
					},
				],
			},
		],
	};
}

function toEmbeds(value: unknown, label: string, fail: Fail): IDataObject[] {
	return entries(value, 'embeds').map((embed) => {
		const result: IDataObject = {};
		for (const key of ['title', 'description', 'url', 'imageUrl']) {
			if (isSet(embed[key])) result[key] = embed[key];
		}
		if (isSet(embed.color)) {
			const color = String(embed.color).trim();
			result.color = /^\d+$/.test(color) ? Number(color) : color;
		}
		const fields = parseJsonArray(embed.fieldsJson, `${label}: Fields (JSON)`, fail);
		if (fields.length > 0) result.fields = fields;
		return result;
	});
}

// ---- Discord poll ----

function pollProperty(base: Base): INodeProperties {
	return {
		...base,
		type: 'fixedCollection',
		placeholder: 'Add Poll',
		default: {},
		options: [
			{
				displayName: 'Poll',
				name: 'poll',
				values: [
					{
						displayName: 'Allow Multiple Answers',
						name: 'allowMultiselect',
						type: 'boolean',
						default: false,
						description: 'Whether a voter can pick several answers',
					},
					{
						displayName: 'Answers',
						name: 'answers',
						type: 'string',
						typeOptions: { rows: 4 },
						default: '',
						description: '2 to 10 answers, one per line, up to 55 characters each',
					},
					{
						displayName: 'Duration (Hours)',
						name: 'durationHours',
						type: 'number',
						typeOptions: { minValue: 1, maxValue: 768 },
						default: 24,
						description: 'How long the poll is open, 1 to 768 hours',
					},
					{
						displayName: 'Question',
						name: 'question',
						type: 'string',
						default: '',
						description: 'Poll question, up to 300 characters',
					},
				],
			},
		],
	};
}

function toPoll(value: unknown): IDataObject | undefined {
	const poll = entries(value, 'poll')[0];
	if (!poll || !isSet(poll.question)) return undefined;
	const answers = (
		Array.isArray(poll.answers) ? poll.answers : String(poll.answers ?? '').split('\n')
	)
		.map((answer) => String(answer).trim())
		.filter((answer) => answer.length > 0);
	const result: IDataObject = { question: poll.question, answers };
	if (typeof poll.durationHours === 'number') result.durationHours = poll.durationHours;
	if (poll.allowMultiselect === true) result.allowMultiselect = true;
	return result;
}

// ---- Registry used by platformOptions.ts ----

export type StructuredKind = 'thread' | 'userTags' | 'embeds' | 'poll';

export const STRUCTURED_PROPERTIES: Record<StructuredKind, (base: Base) => INodeProperties> = {
	thread: threadProperty,
	userTags: userTagsProperty,
	embeds: embedsProperty,
	poll: pollProperty,
};

/** The API value of a structured field, or `undefined` to send nothing. */
export function toStructuredValue(
	kind: StructuredKind,
	value: unknown,
	label: string,
	fail: Fail,
): unknown {
	switch (kind) {
		case 'thread':
			// An added thread with no posts means "no thread on this platform".
			return toThreadItems(value, label, fail);
		case 'userTags': {
			const tags = toUserTags(value, label, fail);
			return tags.length > 0 ? tags : undefined;
		}
		case 'embeds': {
			const embeds = toEmbeds(value, label, fail);
			return embeds.length > 0 ? embeds : undefined;
		}
		case 'poll':
			return toPoll(value);
	}
}
