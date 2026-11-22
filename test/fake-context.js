'use strict';

/**
 * Minimal stand-ins for n8n's execute, hook and webhook contexts. Requests go
 * to `respond(request)`, which returns `{ statusCode, body }`; every request is
 * recorded in `requests`.
 */
function createContext({
	params = {},
	items = [{ json: {} }],
	respond,
	credentials,
	binary,
	staticData,
	timezone,
}) {
	const requests = [];
	const node = {
		id: 'node-1',
		name: 'Ampost',
		type: 'n8n-nodes-ampost.ampost',
		typeVersion: 1,
		parameters: {},
	};
	const nodeStaticData = staticData ?? {};
	const responseObject = { statusCode: 200, sent: undefined };
	responseObject.status = (code) => {
		responseObject.statusCode = code;
		return responseObject;
	};
	responseObject.json = (body) => {
		responseObject.sent = body;
		return responseObject;
	};

	const send = async (options) => {
		requests.push(options);
		const response = await respond(options);
		return response;
	};

	const context = {
		requests,
		responseObject,
		getInputData: () => items,
		getNode: () => node,
		getNodeParameter: (name, _itemIndex, fallback) => {
			if (typeof _itemIndex !== 'number' && _itemIndex !== undefined) fallback = _itemIndex;
			if (Object.prototype.hasOwnProperty.call(params, name)) return params[name];
			if (fallback !== undefined) return fallback;
			throw new Error(`Missing parameter ${name}`);
		},
		getCurrentNodeParameter: (name) => params[name],
		getCredentials: async () =>
			credentials ?? { apiKey: 'amp_live_test', baseUrl: 'https://api.ampost.io/' },
		getTimezone: () => timezone ?? 'UTC',
		continueOnFail: () => params.__continueOnFail === true,
		getWorkflowStaticData: () => nodeStaticData,
		getNodeWebhookUrl: () => params.__webhookUrl,
		getWorkflow: () => ({ id: 'wf-1', name: 'My workflow', active: true }),
		getRequestObject: () => params.__request,
		getHeaderData: () => params.__headers ?? {},
		getBodyData: () => params.__body ?? {},
		getResponseObject: () => responseObject,
		helpers: {
			httpRequestWithAuthentication: async function (credentialName, options) {
				return send({ ...options, credentialName });
			},
			httpRequest: async (options) => {
				const response = await send(options);
				return response.body;
			},
			assertBinaryData: (_itemIndex, name) => {
				if (!binary || !binary[name]) throw new Error(`No binary data in ${name}`);
				return binary[name];
			},
			getBinaryDataBuffer: async (_itemIndex, name) => Buffer.from(binary[name].data, 'base64'),
			returnJsonArray: (data) => (Array.isArray(data) ? data : [data]).map((json) => ({ json })),
		},
	};
	return context;
}

/** A `respond` that answers by `METHOD path`, in order for repeated keys. */
function routes(table) {
	const queues = new Map(
		Object.entries(table).map(([key, value]) => [key, Array.isArray(value) ? [...value] : [value]]),
	);
	return (options) => {
		const url = new URL(options.url);
		const key = `${options.method} ${url.hostname === 'api.ampost.io' ? url.pathname : options.url}`;
		const queue = queues.get(key);
		if (!queue || queue.length === 0) throw new Error(`Unexpected request ${key}`);
		const next = queue.length > 1 ? queue.shift() : queue[0];
		return typeof next === 'function' ? next(options) : next;
	};
}

module.exports = { createContext, routes };
