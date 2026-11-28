import type { INodeProperties } from 'n8n-workflow';
import { platformOptionProperties } from './platformOptions';
import { threadProperty } from './structuredFields';
import {
	paginationFields,
	PLATFORM_OPTIONS,
	optionalPlatformSetField,
	platformSetField,
	POST_STATUS_OPTIONS,
	showFor,
} from './shared';

const COMPOSE = ['create', 'validate'];

export const postOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['post'] } },
		options: [
			{
				name: 'Create',
				value: 'create',
				description:
					'Create a post: publish it now, schedule it, add it to the queue or save a draft',
				action: 'Create a post',
			},
			{
				name: 'Delete',
				value: 'delete',
				description: 'Discard a post that was not published (use Unpublish for a published one)',
				action: 'Delete a post',
			},
			{
				name: 'Edit Published',
				value: 'editPublished',
				description:
					"Replace a published post's text on the platforms. Instagram, Threads, TikTok, Bluesky and X have no edit API: those accounts keep their text, with a notice.",
				action: 'Edit a published post',
			},
			{
				name: 'Get',
				value: 'get',
				description: 'Get a post with the result on each account',
				action: 'Get a post',
			},
			{ name: 'Get Many', value: 'getAll', description: 'List posts', action: 'Get many posts' },
			{
				name: 'Publish',
				value: 'publish',
				description: 'Publish a draft or scheduled post now',
				action: 'Publish a post',
			},
			{
				name: 'Retry',
				value: 'retry',
				description: 'Publish again to the accounts that failed',
				action: 'Retry a post',
			},
			{
				name: 'Unpublish',
				value: 'unpublish',
				description:
					'Delete a published post from the platforms. Instagram and TikTok have no delete API: those accounts keep it, with a notice.',
				action: 'Unpublish a post',
			},
			{
				name: 'Validate',
				value: 'validate',
				description: "Check a post against every platform's rules without creating it",
				action: 'Validate a post',
			},
		],
		default: 'create',
	},
];

const postIdField: INodeProperties = {
	displayName: 'Post ID',
	name: 'postId',
	type: 'string',
	required: true,
	default: '',
	displayOptions: showFor('post', [
		'get',
		'delete',
		'publish',
		'retry',
		'unpublish',
		'editPublished',
	]),
	description: 'ID of the post, as returned by Create or Get Many',
};

const composeFields: INodeProperties[] = [
	{
		displayName: 'Input Mode',
		name: 'inputMode',
		type: 'options',
		noDataExpression: true,
		options: [
			{ name: 'Fields', value: 'fields', description: 'Fill in the post field by field' },
			{
				name: 'JSON',
				value: 'json',
				description: 'Send the whole request body, as in the API reference',
			},
		],
		default: 'fields',
		displayOptions: showFor('post', COMPOSE),
	},
	{
		displayName: 'Post (JSON)',
		name: 'jsonBody',
		type: 'json',
		required: true,
		default:
			'{\n  "targets": [{ "platforms": ["bluesky"] }],\n  "text": "Hello from n8n",\n  "publishNow": true\n}',
		displayOptions: { show: { resource: ['post'], operation: COMPOSE, inputMode: ['json'] } },
		description:
			'The body of POST /api/posts. See <a href="https://ampost.io/docs?ref=n8n">the API reference</a>.',
	},
	{
		...optionalPlatformSetField('getPlatformSetsOrDefault'),
		displayOptions: { show: { resource: ['post'], operation: COMPOSE, inputMode: ['fields'] } },
		description:
			'The platform set whose accounts post. Empty: your default set. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	},
	{
		displayName: 'Platform Names or IDs',
		name: 'platforms',
		type: 'multiOptions',
		required: true,
		typeOptions: { loadOptionsMethod: 'getPlatforms', loadOptionsDependsOn: ['platformSetId'] },
		default: [],
		displayOptions: { show: { resource: ['post'], operation: COMPOSE, inputMode: ['fields'] } },
		hint: 'Each platform needs a connected account in the platform set. As an expression: IDs such as bluesky, linkedin.',
		description:
			'Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
	},
	{
		displayName: 'Text',
		name: 'text',
		type: 'string',
		typeOptions: { rows: 5 },
		default: '',
		displayOptions: { show: { resource: ['post'], operation: COMPOSE, inputMode: ['fields'] } },
		description: 'Post text. Set a different text per platform under Platform Options.',
	},
	{
		displayName: 'When',
		name: 'publishMode',
		type: 'options',
		options: [
			{ name: 'Publish Now', value: 'now', description: 'Publish right after creating' },
			{ name: 'Schedule', value: 'schedule', description: 'Publish at a set time' },
			{
				name: 'Add to Queue',
				value: 'queue',
				description: "Schedule it in the next free slot of the platform set's queue",
			},
			{ name: 'Save as Draft', value: 'draft', description: 'Create it without publishing' },
		],
		default: 'now',
		displayOptions: { show: { resource: ['post'], operation: COMPOSE, inputMode: ['fields'] } },
	},
	{
		displayName: 'Scheduled For',
		name: 'scheduledFor',
		type: 'dateTime',
		required: true,
		default: '',
		displayOptions: {
			show: {
				resource: ['post'],
				operation: COMPOSE,
				inputMode: ['fields'],
				publishMode: ['schedule'],
			},
		},
		description:
			"Publish time in the future. Without a time zone, the n8n instance's time zone applies.",
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: { resource: ['post'], operation: COMPOSE, inputMode: ['fields'] } },
		options: [
			{
				displayName: 'First Comment',
				name: 'firstComment',
				type: 'string',
				typeOptions: { rows: 2 },
				default: '',
				description:
					'Comment posted on each new post right after it publishes (X, Threads and Bluesky: a reply). Every chosen platform must support it.',
			},
			{
				displayName: 'Idempotency Key',
				name: 'idempotencyKey',
				type: 'string',
				default: '',
				placeholder: '={{ $json.guid }}',
				displayOptions: { show: { '/operation': ['create'] } },
				description:
					'A value unique to this post, such as a feed item ID. A repeat with the same key within 24 hours returns the first post instead of posting twice.',
			},
			{
				displayName: 'Link URL',
				name: 'linkUrl',
				type: 'string',
				default: '',
				placeholder: 'https://example.com/article',
				description: "Link to attach. Platforms that don't take links ignore it.",
			},
			{
				displayName: 'Media',
				name: 'media',
				type: 'fixedCollection',
				placeholder: 'Add Media',
				typeOptions: { multipleValues: true, sortable: true },
				default: {},
				description: 'Images and videos at public https URLs, in order',
				options: [
					{
						displayName: 'Item',
						name: 'items',
						values: [
							{
								displayName: 'URL',
								name: 'url',
								type: 'string',
								default: '',
								placeholder: 'https://example.com/photo.jpg',
								description: 'Public https URL, or the URL of a file from Media > Upload',
							},
							{
								displayName: 'Type',
								name: 'type',
								type: 'options',
								options: [
									{ name: 'Image', value: 'image' },
									{ name: 'Video', value: 'video' },
								],
								default: 'image',
							},
							{
								displayName: 'Alt Text',
								name: 'altText',
								type: 'string',
								default: '',
								description: 'Image description for screen readers',
							},
						],
					},
				],
			},
			{
				displayName: 'Media Fit',
				name: 'mediaFit',
				type: 'options',
				options: [
					{ name: 'Pad', value: 'pad', description: 'Bars around the whole frame' },
					{ name: 'Crop', value: 'crop', description: 'The centre fills the frame' },
					{ name: 'None', value: 'none', description: 'Keep the ratio as uploaded' },
				],
				default: 'pad',
				description: "How media outside a platform's aspect ratio is fitted",
			},
			{
				displayName: 'Media Items (JSON)',
				name: 'mediaJson',
				type: 'json',
				default: '',
				placeholder: '={{ $json.files }}',
				description:
					'Media items as a JSON array, added after the Media field. The expression in the placeholder passes the files of a Media > Upload node.',
			},
			{
				displayName: 'Metadata (JSON)',
				name: 'metadata',
				type: 'json',
				default: '{}',
				description:
					'Your own JSON object (max 4 KB), such as your IDs. It comes back on the post and in every webhook event about it.',
			},
			{
				displayName: 'More Targets',
				name: 'extraTargets',
				type: 'fixedCollection',
				placeholder: 'Add Target',
				typeOptions: { multipleValues: true },
				default: {},
				description: 'More platform sets to post to, for example a second LinkedIn account',
				options: [
					{
						displayName: 'Target',
						name: 'targets',
						values: [
							{ ...platformSetField, required: true },
							{
								displayName: 'Platforms',
								name: 'platforms',
								type: 'multiOptions',
								options: PLATFORM_OPTIONS,
								default: [],
								description: 'Platforms of this set to post to',
							},
						],
					},
				],
			},
			threadProperty({
				displayName: 'Thread',
				name: 'thread',
				description:
					'Follow-up posts published right after the post, in order, each replying to the one before (X, Bluesky, Threads), up to 25. Every chosen platform must take a thread; set another per platform under Platform Options. Not with First Comment on one platform.',
			}),
		],
	},
	{
		displayName: 'Platform Options',
		name: 'platformOptions',
		type: 'collection',
		placeholder: 'Add Platform Option',
		default: {},
		displayOptions: { show: { resource: ['post'], operation: COMPOSE, inputMode: ['fields'] } },
		options: platformOptionProperties,
	},
];

const actionFields: INodeProperties[] = [
	{
		displayName: 'New Text',
		name: 'newText',
		type: 'string',
		typeOptions: { rows: 5 },
		required: true,
		default: '',
		displayOptions: showFor('post', ['editPublished']),
		description:
			"The text that replaces the published one. Media and links stay. Each account's new text is in platformPosts[].text; an account the platform refused keeps its text, with platformPosts[].notice.",
	},
	{
		displayName: 'Account Names or IDs',
		name: 'accountIds',
		type: 'multiOptions',
		typeOptions: { loadOptionsMethod: 'getAccounts' },
		default: [],
		displayOptions: showFor('post', ['retry', 'unpublish', 'editPublished']),
		description:
			'Accounts to retry, unpublish or edit. Empty: every failed account (Retry), every account where the post is published (Unpublish, Edit Published). Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	},
	{
		displayName: 'Idempotency Key',
		name: 'idempotencyKey',
		type: 'string',
		default: '',
		displayOptions: showFor('post', ['publish', 'retry']),
		description:
			'A value unique to this action. A repeat with the same key within 24 hours returns the first result.',
	},
];

const listFields: INodeProperties[] = [
	...paginationFields('post', 'getAll'),
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: showFor('post', ['getAll']),
		options: [
			{
				displayName: 'Platform',
				name: 'platform',
				type: 'options',
				options: PLATFORM_OPTIONS,
				default: 'bluesky',
				description: 'Only posts with an account on this platform',
			},
			{
				...optionalPlatformSetField('getPlatformSetsOrAll'),
				description: 'Only posts to this platform set. ' + platformSetField.description,
			},
			{
				displayName: 'Search',
				name: 'search',
				type: 'string',
				default: '',
				description: 'Case-insensitive match on the post text',
			},
			{
				displayName: 'Status',
				name: 'status',
				type: 'options',
				options: POST_STATUS_OPTIONS,
				default: 'published',
				description: 'Only posts with this status',
			},
		],
	},
];

export const postFields: INodeProperties[] = [
	postIdField,
	...composeFields,
	...actionFields,
	...listFields,
];
