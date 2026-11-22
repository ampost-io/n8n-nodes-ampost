import type {
	IDataObject,
	IHookFunctions,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import { ampostApiRequest } from '../Ampost/transport';
import { verifyAmpostSignature } from './signature';

/** The events of POST /api/webhooks/endpoints, as Ampost's docs describe them. */
const EVENTS = [
	{ value: 'post.scheduled', description: 'A post was scheduled, or its publish time changed' },
	{ value: 'post.unscheduled', description: 'A scheduled post went back to a draft' },
	{ value: 'post.discarded', description: 'A post that was not published was discarded' },
	{ value: 'post.published', description: 'Every account of a post published' },
	{
		value: 'post.partial',
		description: 'A post finished with some accounts published and some failed',
	},
	{ value: 'post.failed', description: 'Every account of a post failed' },
	{ value: 'post.platform.published', description: "One account's post went live" },
	{ value: 'post.platform.failed', description: "One account's post failed" },
	{
		value: 'post.platform.deleted',
		description: "One account's post was deleted from its platform",
	},
	{
		value: 'post.platform.edited',
		description: "One account's published text was edited on its platform",
	},
	{ value: 'account.connected', description: 'An account was connected or reconnected' },
	{ value: 'account.disconnected', description: 'An account was disconnected' },
	{
		value: 'account.needs_reconnect',
		description: "An account's access was revoked or expires soon; reconnect it to keep publishing",
	},
	{ value: 'analytics.synced', description: 'Analytics for an account were refreshed' },
].map((event) => ({ name: event.value, ...event }));

const sameEvents = (a: unknown, b: string[]): boolean =>
	Array.isArray(a) && a.length === b.length && b.every((event) => a.includes(event));

const isNotFound = (error: unknown): boolean =>
	error instanceof NodeApiError && error.httpCode === '404';

export class AmpostTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Ampost Trigger',
		name: 'ampostTrigger',
		icon: { light: 'file:ampost.svg', dark: 'file:ampost.dark.svg' },
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["events"].join(", ")}}',
		description:
			'Starts the workflow when Ampost publishes a post, a post fails or an account changes',
		defaults: { name: 'Ampost Trigger' },
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'ampostApi', required: true }],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'webhook',
			},
		],
		properties: [
			{
				displayName: 'Events',
				name: 'events',
				type: 'multiOptions',
				required: true,
				options: EVENTS,
				default: ['post.published', 'post.failed'],
				description: 'The events that start the workflow',
			},
			{
				displayName:
					'Ampost sends events only to public https addresses. n8n must run on one (n8n Cloud does), or set N8N_WEBHOOK_URL (WEBHOOK_URL before n8n 2) to its public address. The API key needs the webhooks:write scope.',
				name: 'notice',
				type: 'notice',
				default: '',
			},
		],
	};

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const staticData = this.getWorkflowStaticData('node');
				const webhookId = staticData.webhookId as string | undefined;
				if (!webhookId) return false;

				const url = this.getNodeWebhookUrl('default');
				const events = this.getNodeParameter('events') as string[];
				const path = `/api/webhooks/endpoints/${encodeURIComponent(webhookId)}`;
				let webhook: IDataObject | undefined;
				try {
					webhook = await ampostApiRequest.call(this, { method: 'GET', path });
				} catch (error) {
					if (!isNotFound(error)) throw new NodeApiError(this.getNode(), error as JsonObject);
				}

				if (
					webhook &&
					webhook.url === url &&
					webhook.enabled === true &&
					sameEvents(webhook.events, events)
				) {
					return true;
				}
				// Gone, turned off by Ampost, or set up for another URL or other events: start over.
				if (webhook) await ampostApiRequest.call(this, { method: 'DELETE', path });
				delete staticData.webhookId;
				delete staticData.webhookSecret;
				return false;
			},

			async create(this: IHookFunctions): Promise<boolean> {
				const url = this.getNodeWebhookUrl('default') ?? '';
				if (!url.startsWith('https://')) {
					throw new NodeOperationError(
						this.getNode(),
						`Ampost sends webhooks only to public https URLs, and this n8n's webhook URL is ${url}`,
						{
							description:
								'Run n8n behind a public https address and set the N8N_WEBHOOK_URL environment variable (WEBHOOK_URL before n8n 2) to it.',
						},
					);
				}
				const events = this.getNodeParameter('events') as string[];
				const workflowName = this.getWorkflow().name ?? '';
				const webhook = await ampostApiRequest.call(this, {
					method: 'POST',
					path: '/api/webhooks/endpoints',
					body: { url, events, description: `n8n: ${workflowName}`.slice(0, 200) },
				});
				const staticData = this.getWorkflowStaticData('node');
				staticData.webhookId = webhook.id;
				staticData.webhookSecret = webhook.secret;
				return true;
			},

			async delete(this: IHookFunctions): Promise<boolean> {
				const staticData = this.getWorkflowStaticData('node');
				const webhookId = staticData.webhookId as string | undefined;
				if (webhookId) {
					try {
						await ampostApiRequest.call(this, {
							method: 'DELETE',
							path: `/api/webhooks/endpoints/${encodeURIComponent(webhookId)}`,
						});
					} catch (error) {
						if (!isNotFound(error)) throw new NodeApiError(this.getNode(), error as JsonObject);
					}
				}
				delete staticData.webhookId;
				delete staticData.webhookSecret;
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const request = this.getRequestObject();
		const headers = this.getHeaderData();
		const secret = this.getWorkflowStaticData('node').webhookSecret as string | undefined;
		const header = (name: string): string | undefined => {
			const value = headers[name];
			return Array.isArray(value) ? value[0] : value;
		};

		const valid = verifyAmpostSignature({
			secret: secret ?? '',
			rawBody: request.rawBody ?? JSON.stringify(this.getBodyData()),
			timestamp: header('ampost-timestamp'),
			signature: header('ampost-signature'),
		});
		if (!valid) {
			this.getResponseObject().status(401).json({ error: 'Invalid Ampost signature' });
			return { noWebhookResponse: true };
		}

		return { workflowData: [this.helpers.returnJsonArray(this.getBodyData())] };
	}
}
