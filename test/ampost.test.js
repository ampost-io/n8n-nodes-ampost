'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { NodeApiError, NodeOperationError } = require('n8n-workflow');
const { createContext, routes } = require('./fake-context');
const { buildPostBody, runOperation, toIsoTime } = require('../dist/nodes/Ampost/actions');
const { buildPlatformOptions } = require('../dist/nodes/Ampost/descriptions/platformOptions');
const { ampostApiRequest, ampostApiRequestAllItems } = require('../dist/nodes/Ampost/transport');
const {
	getAccounts,
	getPlatforms,
	getPlatformSets,
	getPlatformSetsOrAll,
	getPlatformSetsOrDefault,
} = require('../dist/nodes/Ampost/loadOptions');
const { Ampost } = require('../dist/nodes/Ampost/Ampost.node');

const ok = (body) => ({ statusCode: 200, body });

test('toIsoTime reads a wall-clock time in the workflow time zone', () => {
	assert.equal(toIsoTime('2026-12-01T09:00:00', 'Europe/Warsaw'), '2026-12-01T08:00:00.000Z');
	assert.equal(toIsoTime('2026-07-01T09:00:00', 'Europe/Warsaw'), '2026-07-01T07:00:00.000Z');
	assert.equal(toIsoTime('2026-07-01T09:00:00', 'UTC'), '2026-07-01T09:00:00.000Z');
	assert.equal(
		toIsoTime('2026-07-01T09:00:00+02:00', 'America/New_York'),
		'2026-07-01T07:00:00.000Z',
	);
	assert.equal(toIsoTime('2026-07-01T09:00:00Z', 'Asia/Tokyo'), '2026-07-01T09:00:00.000Z');
	assert.equal(toIsoTime('not a date', 'UTC'), null);
});

test('buildPlatformOptions groups fields by platform and converts lists', () => {
	assert.deepEqual(
		buildPlatformOptions({
			tiktok__privacyLevel: 'SELF_ONLY',
			youtube__tags: 'n8n, automation ,',
			instagram__collaborators: '@alice, bob',
			linkedin__text: '',
			bluesky__firstComment: '',
		}),
		{
			tiktok: { privacyLevel: 'SELF_ONLY' },
			youtube: { tags: ['n8n', 'automation'] },
			instagram: { collaborators: ['alice', 'bob'] },
			bluesky: { firstComment: '' },
		},
	);
});

test('buildPostBody turns the fields into a POST /api/posts body', () => {
	const ctx = createContext({
		timezone: 'Europe/Warsaw',
		params: {
			inputMode: 'fields',
			platformSetId: 'set_1',
			platforms: ['linkedin', 'bluesky'],
			text: 'Hello',
			publishMode: 'schedule',
			scheduledFor: '2026-12-01T09:00:00',
			additionalFields: {
				firstComment: 'Link below',
				media: { items: [{ url: 'https://example.com/a.png', type: 'image', altText: '' }] },
				mediaJson: '[{"url":"https://example.com/b.mp4","type":"video"}]',
				metadata: '{"source":"n8n"}',
				extraTargets: { targets: [{ platformSetId: 'set_2', platforms: ['threads'] }] },
			},
			platformOptions: { linkedin__text: 'Hello, LinkedIn' },
		},
	});
	assert.deepEqual(buildPostBody(ctx, 0), {
		targets: [
			{ platformSetId: 'set_1', platforms: ['linkedin', 'bluesky'] },
			{ platformSetId: 'set_2', platforms: ['threads'] },
		],
		text: 'Hello',
		scheduledFor: '2026-12-01T08:00:00.000Z',
		firstComment: 'Link below',
		media: [
			{ url: 'https://example.com/a.png', type: 'image' },
			{ url: 'https://example.com/b.mp4', type: 'video' },
		],
		metadata: { source: 'n8n' },
		options: { linkedin: { text: 'Hello, LinkedIn' } },
	});
});

test('buildPostBody: publish modes, the default set, and JSON input', () => {
	const base = { inputMode: 'fields', platforms: ['bluesky'], text: 'x', additionalFields: {} };
	const now = buildPostBody(createContext({ params: { ...base, publishMode: 'now' } }), 0);
	assert.deepEqual(now, { targets: [{ platforms: ['bluesky'] }], text: 'x', publishNow: true });
	const queued = buildPostBody(createContext({ params: { ...base, publishMode: 'queue' } }), 0);
	assert.equal(queued.useQueue, true);
	const draft = buildPostBody(createContext({ params: { ...base, publishMode: 'draft' } }), 0);
	assert.equal(draft.publishNow, undefined);
	assert.equal(draft.scheduledFor, undefined);

	const json = buildPostBody(
		createContext({ params: { inputMode: 'json', jsonBody: '{"text":"raw","targets":[]}' } }),
		0,
	);
	assert.deepEqual(json, { text: 'raw', targets: [] });
});

test('buildPostBody rejects bad input with NodeOperationError', () => {
	const cases = [
		{ inputMode: 'fields', platforms: [], text: 'x' },
		{ inputMode: 'json', jsonBody: '[1]' },
		{ inputMode: 'json', jsonBody: '{oops' },
		{ inputMode: 'fields', platforms: ['x'], publishMode: 'schedule', scheduledFor: 'soon' },
		{ inputMode: 'fields', platforms: ['x'], additionalFields: { metadata: '[]' } },
		{ inputMode: 'fields', platforms: ['x'], additionalFields: { mediaJson: '["a"]' } },
	];
	for (const params of cases) {
		assert.throws(() => buildPostBody(createContext({ params }), 0), NodeOperationError);
	}
});

test('ampostApiRequest sends the key header path and maps Ampost errors', async () => {
	const ctx = createContext({
		params: {},
		respond: routes({
			'POST /api/posts': {
				statusCode: 403,
				body: {
					error: {
						code: 'INSUFFICIENT_SCOPE',
						message: 'Missing scope',
						details: { required: 'posts:write' },
					},
				},
			},
			'GET /api/posts/p1': ok({ id: 'p1' }),
		}),
	});
	assert.deepEqual(await ampostApiRequest.call(ctx, { method: 'GET', path: '/api/posts/p1' }), {
		id: 'p1',
	});
	const first = ctx.requests[0];
	assert.equal(first.credentialName, 'ampostApi');
	assert.equal(first.url, 'https://api.ampost.io/api/posts/p1');
	assert.equal(first.returnFullResponse, true);
	assert.equal(first.ignoreHttpStatusErrors, true);

	await assert.rejects(
		ampostApiRequest.call(ctx, {
			method: 'POST',
			path: '/api/posts',
			body: {},
			idempotencyKey: 'k1',
		}),
		(error) => {
			assert.ok(error instanceof NodeApiError);
			assert.equal(error.message, 'Missing scope (INSUFFICIENT_SCOPE)');
			assert.equal(error.httpCode, '403');
			assert.match(error.description, /scope/);
			assert.match(error.description, /posts:write/);
			return true;
		},
	);
	assert.equal(ctx.requests[1].headers['Idempotency-Key'], 'k1');
});

test('ampostApiRequestAllItems follows pagination and stops at the limit', async () => {
	const page = (ids, hasMore) => ok({ data: ids.map((id) => ({ id })), pagination: { hasMore } });
	const ctx = createContext({
		respond: routes({ 'GET /api/posts': [page([1, 2], true), page([3], false)] }),
	});
	const all = await ampostApiRequestAllItems.call(ctx, '/api/posts', { status: 'draft' });
	assert.deepEqual(
		all.map((item) => item.id),
		[1, 2, 3],
	);
	assert.deepEqual(ctx.requests[1].qs, { status: 'draft', limit: 100, offset: 2 });

	const limited = createContext({ respond: routes({ 'GET /api/posts': page([1, 2], true) }) });
	const two = await ampostApiRequestAllItems.call(limited, '/api/posts', {}, 2);
	assert.equal(two.length, 2);
	assert.equal(limited.requests.length, 1);
	assert.equal(limited.requests[0].qs.limit, 2);
});

test('post operations call the right endpoints', async () => {
	const ctx = createContext({
		params: { postId: 'p/1', idempotencyKey: 'once', accountIds: ['a1'], newText: 'Fixed' },
		respond: routes({
			'GET /api/posts/p%2F1': ok({ id: 'p/1' }),
			'POST /api/posts/p%2F1/publish': ok({ status: 'posting' }),
			'POST /api/posts/p%2F1/retry': ok({ status: 'posting' }),
			'DELETE /api/posts/p%2F1': ok({ deleted: true }),
			'POST /api/posts/p%2F1/unpublish': ok({ status: 'deleted' }),
			'POST /api/posts/p%2F1/edit-published': ok({ status: 'published' }),
		}),
	});
	await runOperation(ctx, 'post', 'get', 0);
	await runOperation(ctx, 'post', 'publish', 0);
	await runOperation(ctx, 'post', 'retry', 0);
	await runOperation(ctx, 'post', 'delete', 0);
	assert.deepEqual(await runOperation(ctx, 'post', 'unpublish', 0), { status: 'deleted' });
	assert.equal(ctx.requests[1].headers['Idempotency-Key'], 'once');
	assert.deepEqual(ctx.requests[2].body, { accountIds: ['a1'] });
	assert.deepEqual(ctx.requests[4].body, { accountIds: ['a1'] });
	assert.equal(ctx.requests[4].headers['Idempotency-Key'], undefined);
	assert.deepEqual(await runOperation(ctx, 'post', 'editPublished', 0), { status: 'published' });
	assert.deepEqual(ctx.requests[5].body, { text: 'Fixed', accountIds: ['a1'] });
	assert.equal(ctx.requests[5].headers['Idempotency-Key'], undefined);
});

test('account disconnect deletes the account', async () => {
	const ctx = createContext({
		params: { accountId: 'a/1' },
		respond: routes({ 'DELETE /api/accounts/a%2F1': ok({ status: 'revoked', providerRevoked: true }) }),
	});
	assert.deepEqual(await runOperation(ctx, 'account', 'disconnect', 0), { status: 'revoked', providerRevoked: true });
	assert.equal(ctx.requests[0].method, 'DELETE');
});

test('post edit published sends only the text when no account is picked, and refuses empty text', async () => {
	const ctx = createContext({
		params: { postId: 'p1', accountIds: [], newText: 'New' },
		respond: routes({ 'POST /api/posts/p1/edit-published': ok({ status: 'published' }) }),
	});
	await runOperation(ctx, 'post', 'editPublished', 0);
	assert.deepEqual(ctx.requests[0].body, { text: 'New' });
	const empty = createContext({ params: { postId: 'p1', accountIds: [], newText: '  ' }, respond: routes({}) });
	await assert.rejects(runOperation(empty, 'post', 'editPublished', 0), /New Text is empty/);
	assert.equal(empty.requests.length, 0);
});

test('post create sends the idempotency key from Additional Fields', async () => {
	const ctx = createContext({
		params: {
			inputMode: 'fields',
			platforms: ['bluesky'],
			text: 'x',
			publishMode: 'draft',
			additionalFields: { idempotencyKey: 'row-7' },
		},
		respond: routes({ 'POST /api/posts': ok({ id: 'p1' }) }),
	});
	assert.deepEqual(await runOperation(ctx, 'post', 'create', 0), { id: 'p1' });
	assert.equal(ctx.requests[0].headers['Idempotency-Key'], 'row-7');
});

test('media upload: create, PUT to the returned URL, then poll until completed', async () => {
	const ctx = createContext({
		params: { binaryPropertyName: 'data', options: {} },
		binary: {
			data: {
				mimeType: 'image/png',
				fileName: 'cat.png',
				data: Buffer.from('png').toString('base64'),
			},
		},
		respond: routes({
			'POST /api/media/uploads': ok({
				id: 'up1',
				method: 'PUT',
				uploadUrl: 'https://blob.example/cat.png',
				headers: { authorization: 'Bearer client-token' },
			}),
			'PUT https://blob.example/cat.png': ok(''),
			'GET /api/media/uploads/up1': ok({
				id: 'up1',
				status: 'completed',
				files: [{ url: 'https://cdn.example/cat.png', type: 'image' }],
			}),
		}),
	});
	const result = await runOperation(ctx, 'media', 'upload', 0);
	assert.equal(result.files[0].url, 'https://cdn.example/cat.png');
	assert.deepEqual(ctx.requests[0].body, { fileName: 'cat.png' });
	assert.equal(ctx.requests[1].headers['x-content-type'], 'image/png');
	assert.equal(ctx.requests[1].headers.authorization, 'Bearer client-token');
	assert.equal(ctx.requests[1].body.toString(), 'png');
	assert.equal(ctx.requests[1].credentialName, undefined);
});

test('media upload rejects a type Ampost does not take, and a failed check', async () => {
	const gif = createContext({
		params: { binaryPropertyName: 'data', options: {} },
		binary: { data: { mimeType: 'image/gif', data: '' } },
		respond: routes({}),
	});
	await assert.rejects(runOperation(gif, 'media', 'upload', 0), /does not accept image\/gif/);

	const failed = createContext({
		params: { binaryPropertyName: 'data', options: {} },
		binary: { data: { mimeType: 'video/mp4', data: '' } },
		respond: routes({
			'POST /api/media/uploads': ok({
				id: 'up2',
				uploadUrl: 'https://blob.example/v.mp4',
				headers: {},
			}),
			'PUT https://blob.example/v.mp4': ok(''),
			'GET /api/media/uploads/up2': ok({ status: 'failed', error: 'Video too long' }),
		}),
	});
	await assert.rejects(runOperation(failed, 'media', 'upload', 0), (error) => {
		assert.ok(error instanceof NodeOperationError);
		assert.equal(error.message, 'The upload failed: Video too long');
		return true;
	});
});

test('queue slots come back one item each; overview dates are trimmed', async () => {
	const ctx = createContext({
		params: {
			platformSetId: 'set_1',
			count: 3,
			onlyFree: true,
			filters: { from: '2026-11-01T00:00:00', to: '2026-11-30T00:00:00', platform: '' },
		},
		respond: routes({
			'GET /api/platform-sets/set_1/queue/slots': ok({
				platformSetId: 'set_1',
				timezone: 'Europe/Warsaw',
				slots: [{ time: 't1' }, { time: 't2' }],
			}),
			'GET /api/analytics/overview': ok({ totals: {} }),
		}),
	});
	const slots = await runOperation(ctx, 'queue', 'getSlots', 0);
	assert.deepEqual(slots, [
		{ time: 't1', platformSetId: 'set_1', timezone: 'Europe/Warsaw' },
		{ time: 't2', platformSetId: 'set_1', timezone: 'Europe/Warsaw' },
	]);
	assert.deepEqual(ctx.requests[0].qs, { count: 3, filter: 'free' });
	await runOperation(ctx, 'analytics', 'getOverview', 0);
	assert.deepEqual(ctx.requests[1].qs, { from: '2026-11-01', to: '2026-11-30' });
});

test('load options list sets, platforms of the default set, and accounts', async () => {
	const sets = ok({
		data: [
			{ id: 'set_1', name: 'Main', isDefault: true },
			{ id: 'set_2', name: 'Client' },
		],
		pagination: { hasMore: false },
	});
	const accounts = ok({
		data: [
			{ id: 'a2', platform: 'twitter', username: 'amp' },
			{ id: 'a1', platform: 'bluesky', username: 'amp.bsky.social', status: 'revoked' },
		],
		pagination: { hasMore: false },
	});
	const ctx = createContext({
		params: {},
		respond: routes({ 'GET /api/platform-sets': sets, 'GET /api/accounts': accounts }),
	});
	assert.deepEqual(await getPlatformSets.call(ctx), [
		{ name: 'Main (default)', value: 'set_1' },
		{ name: 'Client', value: 'set_2' },
	]);
	assert.deepEqual(await getPlatforms.call(ctx), [
		{ name: 'Bluesky: @amp.bsky.social', value: 'bluesky' },
		{ name: 'X (Twitter): @amp', value: 'twitter' },
	]);
	assert.deepEqual(ctx.requests[2].qs, {
		platformSetId: 'set_1',
		status: 'active',
		limit: 100,
		offset: 0,
	});
	assert.deepEqual(await getAccounts.call(ctx), [
		{ name: 'Bluesky: @amp.bsky.social (disconnected)', value: 'a1' },
		{ name: 'X (Twitter): @amp', value: 'a2' },
	]);
	// Optional set fields start with an empty choice, so an empty value is not flagged as invalid.
	assert.deepEqual((await getPlatformSetsOrDefault.call(ctx))[0], {
		name: 'Default Platform Set',
		value: '',
	});
	assert.deepEqual(
		(await getPlatformSetsOrAll.call(ctx)).map((option) => option.value),
		['', 'set_1', 'set_2'],
	);
});

test('only the required platform set fields lack an empty choice', () => {
	const methods = {};
	const walk = (properties) => {
		for (const property of properties) {
			if (property.name === 'platformSetId') {
				const method = property.typeOptions.loadOptionsMethod;
				assert.equal(method === 'getPlatformSets', property.required === true, method);
				methods[method] = (methods[method] ?? 0) + 1;
			}
			walk(property.options ?? []);
			walk(property.values ?? []);
		}
	};
	walk(new Ampost().description.properties);
	assert.deepEqual(methods, {
		getPlatformSets: 2,
		getPlatformSetsOrAll: 3,
		getPlatformSetsOrDefault: 1,
	});
});

test('the node returns paired items and honours Continue On Fail', async () => {
	const node = new Ampost();
	assert.equal(node.description.usableAsTool, true);
	const respond = routes({
		'GET /api/accounts/a1': [
			ok({ id: 'a1' }),
			{ statusCode: 404, body: { error: { code: 'NOT_FOUND', message: 'No account' } } },
		],
	});
	const ctx = createContext({
		items: [{ json: {} }, { json: {} }],
		params: { resource: 'account', operation: 'get', accountId: 'a1', __continueOnFail: true },
		respond,
	});
	const [out] = await node.execute.call(ctx);
	assert.deepEqual(out[0], { json: { id: 'a1' }, pairedItem: { item: 0 } });
	assert.equal(out[1].pairedItem.item, 1);
	assert.match(out[1].json.error, /No account \(NOT_FOUND\)/);

	const strict = createContext({
		params: { resource: 'account', operation: 'get', accountId: 'a1' },
		respond: routes({ 'GET /api/accounts/a1': { statusCode: 500, body: {} } }),
	});
	await assert.rejects(node.execute.call(strict), NodeApiError);
});
