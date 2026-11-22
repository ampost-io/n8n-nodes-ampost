import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class AmpostApi implements ICredentialType {
	name = 'ampostApi';

	displayName = 'Ampost API';

	icon: Icon = { light: 'file:ampost.svg', dark: 'file:ampost.dark.svg' };

	documentationUrl = 'https://github.com/ampost-io/n8n-nodes-ampost?tab=readme-ov-file#credentials';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
			placeholder: 'amp_live_...',
			description:
				'Create a key in Ampost under Settings, API keys. Give it the scopes the workflow needs; the trigger needs webhooks:write.',
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://api.ampost.io',
			description: 'Leave as is unless Ampost support gives you another API address',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	// Docs search needs a valid key but no scope, so any key passes the test.
	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl.replace(/\\/+$/, "")}}',
			url: '/api/docs/search',
			qs: { query: 'posts', limit: 1 },
		},
	};
}
