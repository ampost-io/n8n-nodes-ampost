import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import { runOperation } from './actions';
import {
	accountFields,
	accountOperations,
	analyticsFields,
	analyticsOperations,
	mediaFields,
	mediaOperations,
	platformSetFields,
	platformSetOperations,
	queueFields,
	queueOperations,
} from './descriptions/OtherDescriptions';
import { postFields, postOperations } from './descriptions/PostDescription';
import { getAccounts, getPlatforms, getPlatformSets } from './loadOptions';

/**
 * Programmatic style: Media > Upload needs three dependent calls (start the
 * upload, send the bytes to its URL, poll until Ampost has checked the file),
 * which the declarative routing cannot express.
 */
export class Ampost implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Ampost',
		name: 'ampost',
		icon: { light: 'file:ampost.svg', dark: 'file:ampost.dark.svg' },
		group: ['output'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description:
			'Publish and schedule posts on Instagram, TikTok, LinkedIn, X, YouTube and more with one API',
		defaults: { name: 'Ampost' },
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'ampostApi', required: true }],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Account', value: 'account' },
					{ name: 'Analytic', value: 'analytics' },
					{ name: 'Media', value: 'media' },
					{ name: 'Platform Set', value: 'platformSet' },
					{ name: 'Post', value: 'post' },
					{ name: 'Queue', value: 'queue' },
				],
				default: 'post',
			},
			...postOperations,
			...postFields,
			...accountOperations,
			...accountFields,
			...mediaOperations,
			...mediaFields,
			...platformSetOperations,
			...platformSetFields,
			...queueOperations,
			...queueFields,
			...analyticsOperations,
			...analyticsFields,
		],
	};

	methods = {
		loadOptions: { getAccounts, getPlatforms, getPlatformSets },
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				const operation = this.getNodeParameter('operation', i) as string;
				const result = await runOperation(this, resource, operation, i);
				const results = Array.isArray(result) ? result : [result];
				for (const json of results) {
					returnData.push({ json, pairedItem: { item: i } });
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({ json: { error: (error as Error).message }, pairedItem: { item: i } });
					continue;
				}
				// Both constructors hand back an error that is already theirs.
				if (error instanceof NodeOperationError)
					throw new NodeOperationError(this.getNode(), error, { itemIndex: i });
				throw new NodeApiError(this.getNode(), error as JsonObject, { itemIndex: i });
			}
		}

		return [returnData];
	}
}
