'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const { NodeOperationError } = require('n8n-workflow');
const { createContext, routes } = require('./fake-context');
const { AmpostTrigger } = require('../dist/nodes/AmpostTrigger/AmpostTrigger.node');
const { verifyAmpostSignature } = require('../dist/nodes/AmpostTrigger/signature');

const ok = (body) => ({ statusCode: 200, body });
const SECRET = 'whsec_test';
const URL = 'https://n8n.example.com/webhook/abc/webhook';
const EVENTS = ['post.published', 'post.failed'];

const sign = (body, timestamp, secret = SECRET) =>
	`sha256=${createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')}`;

test('verifyAmpostSignature accepts a good signature and rejects the rest', () => {
	const body = '{"type":"post.published"}';
	const now = 1_800_000_000;
	const timestamp = String(now);
	const signature = sign(body, timestamp);
	assert.equal(
		verifyAmpostSignature({ secret: SECRET, rawBody: body, timestamp, signature, nowSeconds: now }),
		true,
	);
	assert.equal(
		verifyAmpostSignature({
			secret: SECRET,
			rawBody: Buffer.from(body),
			timestamp,
			signature,
			nowSeconds: now + 300,
		}),
		true,
	);
	assert.equal(
		verifyAmpostSignature({
			secret: SECRET,
			rawBody: body,
			timestamp,
			signature,
			nowSeconds: now + 301,
		}),
		false,
	);
	assert.equal(
		verifyAmpostSignature({
			secret: SECRET,
			rawBody: `${body} `,
			timestamp,
			signature,
			nowSeconds: now,
		}),
		false,
	);
	assert.equal(
		verifyAmpostSignature({
			secret: 'other',
			rawBody: body,
			timestamp,
			signature,
			nowSeconds: now,
		}),
		false,
	);
	assert.equal(
		verifyAmpostSignature({
			secret: SECRET,
			rawBody: body,
			timestamp: 'x',
			signature,
			nowSeconds: now,
		}),
		false,
	);
	assert.equal(
		verifyAmpostSignature({
			secret: SECRET,
			rawBody: body,
			timestamp,
			signature: undefined,
			nowSeconds: now,
		}),
		false,
	);
	assert.equal(
		verifyAmpostSignature({ secret: '', rawBody: body, timestamp, signature, nowSeconds: now }),
		false,
	);
});

test('create registers the webhook and stores its id and secret', async () => {
	const trigger = new AmpostTrigger();
	const staticData = {};
	const ctx = createContext({
		staticData,
		params: { events: EVENTS, __webhookUrl: URL },
		respond: routes({ 'POST /api/webhooks/endpoints': ok({ id: 'wh_1', secret: SECRET }) }),
	});
	assert.equal(await trigger.webhookMethods.default.create.call(ctx), true);
	assert.deepEqual(ctx.requests[0].body, {
		url: URL,
		events: EVENTS,
		description: 'n8n: My workflow',
	});
	assert.deepEqual(staticData, { webhookId: 'wh_1', webhookSecret: SECRET });
});

test('create refuses a webhook URL that is not https', async () => {
	const trigger = new AmpostTrigger();
	const ctx = createContext({
		params: { events: EVENTS, __webhookUrl: 'http://localhost:5678/webhook/abc/webhook' },
		respond: routes({}),
	});
	await assert.rejects(trigger.webhookMethods.default.create.call(ctx), NodeOperationError);
	assert.equal(ctx.requests.length, 0);
});

test('checkExists keeps a matching webhook and replaces a changed one', async () => {
	const trigger = new AmpostTrigger();
	const matching = createContext({
		staticData: { webhookId: 'wh_1', webhookSecret: SECRET },
		params: { events: [...EVENTS].reverse(), __webhookUrl: URL },
		respond: routes({
			'GET /api/webhooks/endpoints/wh_1': ok({
				id: 'wh_1',
				url: URL,
				events: EVENTS,
				enabled: true,
			}),
		}),
	});
	assert.equal(await trigger.webhookMethods.default.checkExists.call(matching), true);

	const staticData = { webhookId: 'wh_1', webhookSecret: SECRET };
	const changed = createContext({
		staticData,
		params: { events: ['post.published'], __webhookUrl: URL },
		respond: routes({
			'GET /api/webhooks/endpoints/wh_1': ok({
				id: 'wh_1',
				url: URL,
				events: EVENTS,
				enabled: true,
			}),
			'DELETE /api/webhooks/endpoints/wh_1': ok({ deleted: true }),
		}),
	});
	assert.equal(await trigger.webhookMethods.default.checkExists.call(changed), false);
	assert.equal(changed.requests[1].method, 'DELETE');
	assert.deepEqual(staticData, {});

	const goneData = { webhookId: 'wh_9' };
	const gone = createContext({
		staticData: goneData,
		params: { events: EVENTS, __webhookUrl: URL },
		respond: routes({
			'GET /api/webhooks/endpoints/wh_9': {
				statusCode: 404,
				body: { error: { code: 'NOT_FOUND', message: 'No webhook' } },
			},
		}),
	});
	assert.equal(await trigger.webhookMethods.default.checkExists.call(gone), false);
	assert.deepEqual(goneData, {});

	const none = createContext({
		params: { events: EVENTS, __webhookUrl: URL },
		respond: routes({}),
	});
	assert.equal(await trigger.webhookMethods.default.checkExists.call(none), false);
});

test('delete removes the webhook, and a 404 is fine', async () => {
	const trigger = new AmpostTrigger();
	for (const answer of [
		ok({ deleted: true }),
		{ statusCode: 404, body: { error: { code: 'NOT_FOUND', message: 'gone' } } },
	]) {
		const staticData = { webhookId: 'wh_1', webhookSecret: SECRET };
		const ctx = createContext({
			staticData,
			respond: routes({ 'DELETE /api/webhooks/endpoints/wh_1': answer }),
		});
		assert.equal(await trigger.webhookMethods.default.delete.call(ctx), true);
		assert.deepEqual(staticData, {});
	}
	const failing = createContext({
		staticData: { webhookId: 'wh_1' },
		respond: routes({ 'DELETE /api/webhooks/endpoints/wh_1': { statusCode: 500, body: {} } }),
	});
	await assert.rejects(trigger.webhookMethods.default.delete.call(failing));
});

test('webhook starts the workflow only for a valid signature', async () => {
	const trigger = new AmpostTrigger();
	const event = { id: 'evt_1', type: 'post.published', data: { postId: 'p1' } };
	const rawBody = Buffer.from(JSON.stringify(event));
	const timestamp = String(Math.floor(Date.now() / 1000));

	const good = createContext({
		staticData: { webhookId: 'wh_1', webhookSecret: SECRET },
		params: {
			__request: { rawBody },
			__body: event,
			__headers: {
				'ampost-timestamp': timestamp,
				'ampost-signature': sign(rawBody.toString(), timestamp),
			},
		},
	});
	assert.deepEqual(await trigger.webhook.call(good), { workflowData: [[{ json: event }]] });

	const bad = createContext({
		staticData: { webhookId: 'wh_1', webhookSecret: SECRET },
		params: {
			__request: { rawBody },
			__body: event,
			__headers: {
				'ampost-timestamp': timestamp,
				'ampost-signature': sign(rawBody.toString(), timestamp, 'wrong'),
			},
		},
	});
	assert.deepEqual(await trigger.webhook.call(bad), { noWebhookResponse: true });
	assert.equal(bad.responseObject.statusCode, 401);
});
