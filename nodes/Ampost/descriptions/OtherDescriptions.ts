import type { INodeProperties } from 'n8n-workflow';
import {
	optionalPlatformSetField,
	paginationFields,
	PLATFORM_OPTIONS,
	platformSetField,
	showFor,
} from './shared';

const accountField = (description: string): Omit<INodeProperties, 'displayOptions'> => ({
	displayName: 'Account Name or ID',
	name: 'accountId',
	type: 'options',
	typeOptions: { loadOptionsMethod: 'getAccounts' },
	default: '',
	description: `${description} Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>`,
});

const platformFilter = (description: string): INodeProperties => ({
	displayName: 'Platform',
	name: 'platform',
	type: 'options',
	options: PLATFORM_OPTIONS,
	default: 'bluesky',
	description,
});

// ─── Account ───────────────────────────────────────────────────────────────

export const accountOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['account'] } },
		options: [
			{
				name: 'Disconnect',
				value: 'disconnect',
				description:
					"Revoke Ampost's access and delete the account's tokens. Its scheduled posts will fail; reconnect it in the dashboard.",
				action: 'Disconnect an account',
			},
			{
				name: 'Get',
				value: 'get',
				description: 'Get a connected account with its health and platform details',
				action: 'Get an account',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'List connected accounts',
				action: 'Get many accounts',
			},
		],
		default: 'getAll',
	},
];

export const accountFields: INodeProperties[] = [
	{
		...accountField('The account to get.'),
		required: true,
		displayOptions: showFor('account', ['get']),
	},
	{
		...accountField(
			'The account to disconnect. Instagram and Threads have no revoke API: the result has providerRevoked false and providerAccessSettings, where to remove Ampost.',
		),
		required: true,
		displayOptions: showFor('account', ['disconnect']),
	},
	...paginationFields('account', 'getAll'),
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: showFor('account', ['getAll']),
		options: [
			platformFilter('Only accounts on this platform'),
			{
				...optionalPlatformSetField('getPlatformSetsOrAll'),
				description: 'Only accounts in this platform set. ' + platformSetField.description,
			},
			{
				displayName: 'Status',
				name: 'status',
				type: 'options',
				options: [
					{ name: 'Active', value: 'active', description: 'Accounts that can publish' },
					{ name: 'Revoked', value: 'revoked', description: 'Disconnected accounts' },
					{ name: 'All', value: 'all' },
				],
				default: 'active',
			},
		],
	},
];

// ─── Media ─────────────────────────────────────────────────────────────────

export const mediaOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['media'] } },
		options: [
			{
				name: 'Upload',
				value: 'upload',
				description: 'Upload a file from binary data, to use in a post',
				action: 'Upload media',
			},
		],
		default: 'upload',
	},
];

export const mediaFields: INodeProperties[] = [
	{
		displayName: 'Input Binary Field',
		name: 'binaryPropertyName',
		type: 'string',
		required: true,
		default: 'data',
		displayOptions: showFor('media', ['upload']),
		hint: 'The name of the input binary field holding the file',
		description: 'JPEG, PNG, WebP, MP4, QuickTime or WebM',
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: showFor('media', ['upload']),
		options: [
			{
				displayName: 'File Name',
				name: 'fileName',
				type: 'string',
				default: '',
				description: "File name to store. Default: the binary data's file name.",
			},
			{
				displayName: 'Wait Timeout (Seconds)',
				name: 'waitTimeout',
				type: 'number',
				typeOptions: { minValue: 5, maxValue: 300 },
				default: 60,
				description: 'How long to wait for Ampost to check the file before the node fails',
			},
		],
	},
];

// ─── Platform set ──────────────────────────────────────────────────────────

export const platformSetOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['platformSet'] } },
		options: [
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'List platform sets (groups of accounts, one per platform)',
				action: 'Get many platform sets',
			},
		],
		default: 'getAll',
	},
];

export const platformSetFields: INodeProperties[] = [...paginationFields('platformSet', 'getAll')];

// ─── Queue ─────────────────────────────────────────────────────────────────

export const queueOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['queue'] } },
		options: [
			{
				name: 'Get Slots',
				value: 'getSlots',
				description: "Preview the next slot times of a platform set's posting queue",
				action: 'Get queue slots',
			},
		],
		default: 'getSlots',
	},
];

export const queueFields: INodeProperties[] = [
	{
		// One item per slot: an empty queue outputs no items, and n8n then skips every node after this one.
		displayName:
			'Outputs one item per slot. When the queue has no slots (none set up, or none free with Only Free Slots), it outputs nothing and the nodes after it do not run. To continue anyway, turn on Always Output Data in this node\'s settings.',
		name: 'emptyQueueNotice',
		type: 'notice',
		default: '',
		displayOptions: showFor('queue', ['getSlots']),
	},
	{
		...platformSetField,
		required: true,
		displayOptions: showFor('queue', ['getSlots']),
	},
	{
		displayName: 'Count',
		name: 'count',
		type: 'number',
		typeOptions: { minValue: 1, maxValue: 50 },
		default: 10,
		displayOptions: showFor('queue', ['getSlots']),
		description: 'How many slots to return',
	},
	{
		displayName: 'Only Free Slots',
		name: 'onlyFree',
		type: 'boolean',
		default: false,
		displayOptions: showFor('queue', ['getSlots']),
		description:
			'Whether to return only free slots. The first free slot is where the next post added to the queue goes.',
	},
];

// ─── Analytics ─────────────────────────────────────────────────────────────

export const analyticsOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['analytics'] } },
		options: [
			{
				name: 'Get Overview',
				value: 'getOverview',
				description:
					'Totals per account and overall for a date range: posts, views, reach, likes, followers',
				action: 'Get an analytics overview',
			},
			{
				name: 'Get Post Metrics',
				value: 'getPosts',
				description: 'Metrics of published posts, one entry per account, newest first',
				action: 'Get post metrics',
			},
		],
		default: 'getPosts',
	},
];

export const analyticsFields: INodeProperties[] = [
	...paginationFields('analytics', 'getPosts'),
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: showFor('analytics', ['getPosts', 'getOverview']),
		options: [
			{ ...accountField('Only this account.') },
			{
				displayName: 'From',
				name: 'from',
				type: 'dateTime',
				default: '',
				displayOptions: { show: { '/operation': ['getOverview'] } },
				description: 'First day (UTC). Default: 29 days before To. At most 90 days with To.',
			},
			platformFilter('Only accounts on this platform'),
			{
				...optionalPlatformSetField('getPlatformSetsOrAll'),
				description: 'Only accounts in this platform set. ' + platformSetField.description,
			},
			{
				displayName: 'Post ID',
				name: 'postId',
				type: 'string',
				default: '',
				displayOptions: { show: { '/operation': ['getPosts'] } },
				description: 'Only this post',
			},
			{
				displayName: 'To',
				name: 'to',
				type: 'dateTime',
				default: '',
				displayOptions: { show: { '/operation': ['getOverview'] } },
				description: 'Last day (UTC), included. Default: today.',
			},
		],
	},
];
