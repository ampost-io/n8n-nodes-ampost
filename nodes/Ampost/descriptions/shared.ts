import type { INodeProperties, INodePropertyOptions } from 'n8n-workflow';

export const PLATFORM_OPTIONS: INodePropertyOptions[] = [
	{ name: 'Bluesky', value: 'bluesky' },
	{ name: 'Discord', value: 'discord' },
	{ name: 'Facebook', value: 'facebook' },
	{ name: 'Instagram', value: 'instagram' },
	{ name: 'LinkedIn', value: 'linkedin' },
	{ name: 'Pinterest', value: 'pinterest' },
	{ name: 'Telegram', value: 'telegram' },
	{ name: 'Threads', value: 'threads' },
	{ name: 'TikTok', value: 'tiktok' },
	{ name: 'X (Twitter)', value: 'twitter' },
	{ name: 'YouTube', value: 'youtube' },
];

export const POST_STATUS_OPTIONS: INodePropertyOptions[] = [
	{ name: 'Deleted', value: 'deleted' },
	{ name: 'Discarded', value: 'discarded' },
	{ name: 'Draft', value: 'draft' },
	{ name: 'Failed', value: 'failed' },
	{ name: 'Partial', value: 'partial' },
	{ name: 'Posting', value: 'posting' },
	{ name: 'Published', value: 'published' },
	{ name: 'Queued', value: 'queued' },
	{ name: 'Scheduled', value: 'scheduled' },
];

export function showFor(resource: string, operation: string[]): INodeProperties['displayOptions'] {
	return { show: { resource: [resource], operation } };
}

/** The "Return All" + "Limit" pair of a list operation. */
export function paginationFields(resource: string, operation: string): INodeProperties[] {
	return [
		{
			displayName: 'Return All',
			name: 'returnAll',
			type: 'boolean',
			displayOptions: showFor(resource, [operation]),
			default: false,
			description: 'Whether to return all results or only up to a given limit',
		},
		{
			displayName: 'Limit',
			name: 'limit',
			type: 'number',
			displayOptions: {
				show: { resource: [resource], operation: [operation], returnAll: [false] },
			},
			typeOptions: { minValue: 1 },
			default: 50,
			description: 'Max number of results to return',
		},
	];
}

export const platformSetField: Omit<INodeProperties, 'displayOptions'> = {
	displayName: 'Platform Set Name or ID',
	name: 'platformSetId',
	type: 'options',
	typeOptions: { loadOptionsMethod: 'getPlatformSets' },
	default: '',
	description:
		'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
};
