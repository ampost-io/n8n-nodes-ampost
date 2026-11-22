import type { IDataObject, INodeProperties } from 'n8n-workflow';

/**
 * Per-platform settings of a post (`options.<platform>.<field>` in the API).
 * They are one "Platform Options" collection: each field is named
 * `<platform>__<field>` and labelled "<Platform>: <Field>", so the user adds
 * only the ones they need and nothing else is sent.
 */
type FieldKind = 'string' | 'boolean' | 'number' | 'list' | { options: string[] };

interface PlatformField {
	platform: string;
	field: string;
	label: string;
	kind: FieldKind;
	description: string;
}

const PLATFORM_LABELS: Record<string, string> = {
	bluesky: 'Bluesky',
	discord: 'Discord',
	facebook: 'Facebook',
	instagram: 'Instagram',
	linkedin: 'LinkedIn',
	pinterest: 'Pinterest',
	telegram: 'Telegram',
	threads: 'Threads',
	tiktok: 'TikTok',
	twitter: 'X',
	youtube: 'YouTube',
};

const TEXT_DESCRIPTION = "Text for this platform instead of the post's text";
const FIRST_COMMENT_DESCRIPTION =
	"First comment for this platform instead of the post's; empty posts none here";
const FIRST_COMMENT_PLATFORMS = [
	'bluesky',
	'facebook',
	'instagram',
	'linkedin',
	'threads',
	'twitter',
	'youtube',
];

const FIELDS: PlatformField[] = [
	...Object.keys(PLATFORM_LABELS).map(
		(platform): PlatformField => ({
			platform,
			field: 'text',
			label: 'Text',
			kind: 'string',
			description: TEXT_DESCRIPTION,
		}),
	),
	...FIRST_COMMENT_PLATFORMS.map(
		(platform): PlatformField => ({
			platform,
			field: 'firstComment',
			label: 'First Comment',
			kind: 'string',
			description: FIRST_COMMENT_DESCRIPTION,
		}),
	),
	{
		platform: 'instagram',
		field: 'placement',
		label: 'Placement',
		kind: { options: ['feed', 'story', 'reel', 'carousel'] },
		description:
			'Where the post appears. When not set: one image is feed, 2+ images are a carousel, one video is a reel. A story disappears after 24 hours.',
	},
	{
		platform: 'instagram',
		field: 'collaborators',
		label: 'Collaborators',
		kind: 'list',
		description:
			'Up to 3 usernames (without @), comma-separated, invited to show the post on their profiles. Not on stories.',
	},
	{
		platform: 'instagram',
		field: 'coverUrl',
		label: 'Reel Cover URL',
		kind: 'string',
		description: 'Reels: cover image, a public https JPEG',
	},
	{
		platform: 'instagram',
		field: 'thumbOffset',
		label: 'Reel Cover Frame (Ms)',
		kind: 'number',
		description: 'Reels: cover frame, milliseconds from the start',
	},
	{
		platform: 'instagram',
		field: 'shareToFeed',
		label: 'Share Reel to Feed',
		kind: 'boolean',
		description: 'Whether a reel also shows in the feed grid (Ampost default: on)',
	},
	{
		platform: 'facebook',
		field: 'placement',
		label: 'Placement',
		kind: { options: ['feed', 'story', 'reel'] },
		description: 'Where the post appears. Default: feed. A story disappears after 24 hours.',
	},
	{
		platform: 'linkedin',
		field: 'visibility',
		label: 'Visibility',
		kind: { options: ['PUBLIC', 'CONNECTIONS'] },
		description: 'Who can see the post. Default: PUBLIC.',
	},
	{
		platform: 'linkedin',
		field: 'isReshareDisabledByAuthor',
		label: 'Disable Reshares',
		kind: 'boolean',
		description: 'Whether to stop others from resharing the post',
	},
	{
		platform: 'linkedin',
		field: 'articleTitle',
		label: 'Link Preview Title',
		kind: 'string',
		description: 'Link preview title. Needs a link URL.',
	},
	{
		platform: 'linkedin',
		field: 'articleDescription',
		label: 'Link Preview Description',
		kind: 'string',
		description: 'Link preview description. Needs a link URL.',
	},
	{
		platform: 'linkedin',
		field: 'videoTitle',
		label: 'Video Title',
		kind: 'string',
		description: 'Video title. Needs a video.',
	},
	{
		platform: 'tiktok',
		field: 'privacyLevel',
		label: 'Privacy Level',
		kind: {
			options: ['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'FOLLOWER_OF_CREATOR', 'SELF_ONLY'],
		},
		description:
			"Required unless sent as an inbox draft. Pick one of the account's privacyLevelOptions (Account > Get).",
	},
	{
		platform: 'tiktok',
		field: 'consent',
		label: 'Music Usage Consent',
		kind: 'boolean',
		description:
			"Whether the creator agreed to TikTok's Music Usage Confirmation (and Branded Content Policy for branded content). Required unless sent as an inbox draft.",
	},
	{
		platform: 'tiktok',
		field: 'disableComment',
		label: 'Disable Comments',
		kind: 'boolean',
		description: 'Whether comments are off (Ampost default: off)',
	},
	{
		platform: 'tiktok',
		field: 'disableDuet',
		label: 'Disable Duet',
		kind: 'boolean',
		description: 'Whether duets are off; video only (Ampost default: off)',
	},
	{
		platform: 'tiktok',
		field: 'disableStitch',
		label: 'Disable Stitch',
		kind: 'boolean',
		description: 'Whether stitches are off; video only (Ampost default: off)',
	},
	{
		platform: 'tiktok',
		field: 'videoCoverTimestampMs',
		label: 'Video Cover Frame (Ms)',
		kind: 'number',
		description: 'Video frame used as the cover, in milliseconds',
	},
	{
		platform: 'tiktok',
		field: 'photoCoverIndex',
		label: 'Photo Cover Index',
		kind: 'number',
		description: 'Index of the photo used as the cover. Default 0.',
	},
	{
		platform: 'tiktok',
		field: 'autoAddMusic',
		label: 'Auto Add Music',
		kind: 'boolean',
		description: 'Whether TikTok adds music; photo posts only',
	},
	{
		platform: 'tiktok',
		field: 'brandContentToggle',
		label: 'Paid Partnership',
		kind: 'boolean',
		description: 'Whether the post promotes a third party. Not with SELF_ONLY.',
	},
	{
		platform: 'tiktok',
		field: 'brandOrganicToggle',
		label: 'Promotes Own Business',
		kind: 'boolean',
		description: "Whether the post promotes the creator's own business",
	},
	{
		platform: 'tiktok',
		field: 'isAigc',
		label: 'AI-Generated',
		kind: 'boolean',
		description: 'Whether the video is AI-generated',
	},
	{
		platform: 'tiktok',
		field: 'inboxDraft',
		label: 'Send as Inbox Draft',
		kind: 'boolean',
		description:
			"Whether to send it to the creator's TikTok inbox as a draft; they post it in the TikTok app",
	},
	{
		platform: 'discord',
		field: 'username',
		label: 'Sender Name',
		kind: 'string',
		description: "Sender name instead of the webhook's",
	},
	{
		platform: 'discord',
		field: 'avatarUrl',
		label: 'Sender Avatar URL',
		kind: 'string',
		description: "Sender avatar instead of the webhook's",
	},
	{
		platform: 'discord',
		field: 'threadName',
		label: 'Forum Post Title',
		kind: 'string',
		description: 'Title of a new forum-channel post; required in forum channels, refused elsewhere',
	},
	{
		platform: 'telegram',
		field: 'parseMode',
		label: 'Parse Mode',
		kind: { options: ['MarkdownV2', 'HTML'] },
		description: "Format the text with Telegram's rules. Not set: plain text.",
	},
	{
		platform: 'telegram',
		field: 'disableNotification',
		label: 'Send Silently',
		kind: 'boolean',
		description: 'Whether to send without a notification',
	},
	{
		platform: 'telegram',
		field: 'protectContent',
		label: 'Protect Content',
		kind: 'boolean',
		description: 'Whether to block forwarding and saving',
	},
	{
		platform: 'telegram',
		field: 'disableLinkPreview',
		label: 'Disable Link Preview',
		kind: 'boolean',
		description: 'Whether to send links without a preview',
	},
	{
		platform: 'telegram',
		field: 'sendAsDocument',
		label: 'Send Media as Files',
		kind: 'boolean',
		description: 'Whether to send media as files, not recompressed',
	},
	{
		platform: 'youtube',
		field: 'title',
		label: 'Title',
		kind: 'string',
		description:
			"Video title, up to 100 characters. The post's text becomes the description. Not set: the text's first line.",
	},
	{
		platform: 'youtube',
		field: 'privacyStatus',
		label: 'Privacy',
		kind: { options: ['public', 'unlisted', 'private'] },
		description: 'Who can watch the video. Default: public.',
	},
	{
		platform: 'youtube',
		field: 'madeForKids',
		label: 'Made for Kids',
		kind: 'boolean',
		description: 'Whether the video is made for kids (COPPA). YouTube requires the answer.',
	},
	{
		platform: 'youtube',
		field: 'tags',
		label: 'Tags',
		kind: 'list',
		description: 'Video tags, comma-separated; at most 500 characters together',
	},
	{
		platform: 'youtube',
		field: 'categoryId',
		label: 'Category ID',
		kind: 'string',
		description:
			'YouTube category ID, e.g. 22 (People & Blogs, the default) or 28 (Science & Technology)',
	},
	{
		platform: 'youtube',
		field: 'playlistId',
		label: 'Playlist ID',
		kind: 'string',
		description: 'Adds the video to this playlist of the channel',
	},
	{
		platform: 'youtube',
		field: 'notifySubscribers',
		label: 'Notify Subscribers',
		kind: 'boolean',
		description: "Whether to notify the channel's subscribers (Ampost default: on)",
	},
	{
		platform: 'youtube',
		field: 'containsSyntheticMedia',
		label: 'Contains Synthetic Media',
		kind: 'boolean',
		description: 'Whether the video has realistic altered or AI-generated content',
	},
	{
		platform: 'pinterest',
		field: 'boardId',
		label: 'Board ID',
		kind: 'string',
		description: "The board to save the Pin to. Not set: the account's default board.",
	},
	{
		platform: 'pinterest',
		field: 'title',
		label: 'Pin Title',
		kind: 'string',
		description: 'Pin title, up to 100 characters',
	},
];

const SEPARATOR = '__';

function toProperty(spec: PlatformField): INodeProperties {
	const base = {
		displayName: `${PLATFORM_LABELS[spec.platform]}: ${spec.label}`,
		name: `${spec.platform}${SEPARATOR}${spec.field}`,
		description: spec.description,
	};
	if (typeof spec.kind === 'object') {
		return {
			...base,
			type: 'options',
			options: spec.kind.options.map((value) => ({ name: value, value })),
			default: spec.kind.options[0],
		};
	}
	switch (spec.kind) {
		case 'boolean':
			return { ...base, type: 'boolean', default: false };
		case 'number':
			return { ...base, type: 'number', typeOptions: { minValue: 0 }, default: 0 };
		case 'string':
			return {
				...base,
				type: 'string',
				default: '',
				typeOptions: spec.field === 'text' ? { rows: 3 } : undefined,
			};
		case 'list':
			return { ...base, type: 'string', default: '' };
	}
}

export const platformOptionProperties: INodeProperties[] = FIELDS.map(toProperty).sort((a, b) =>
	a.displayName.localeCompare(b.displayName),
);

const LIST_FIELDS = new Set(
	FIELDS.filter((spec) => spec.kind === 'list').map(
		(spec) => `${spec.platform}${SEPARATOR}${spec.field}`,
	),
);

/** `{ "tiktok__privacyLevel": "SELF_ONLY" }` → `{ tiktok: { privacyLevel: "SELF_ONLY" } }`. */
export function buildPlatformOptions(values: IDataObject): IDataObject {
	const options: Record<string, IDataObject> = {};
	for (const [name, value] of Object.entries(values)) {
		const [platform, field] = name.split(SEPARATOR);
		if (!platform || !field) continue;
		// An empty first comment means "none on this platform"; any other empty field is unset.
		if (value === '' && field !== 'firstComment') continue;
		let converted: unknown = value;
		if (LIST_FIELDS.has(name)) {
			converted = String(value)
				.split(',')
				.map((entry) => entry.trim().replace(/^@/, ''))
				.filter((entry) => entry.length > 0);
		}
		(options[platform] ??= {})[field] = converted as IDataObject[keyof IDataObject];
	}
	return options;
}
