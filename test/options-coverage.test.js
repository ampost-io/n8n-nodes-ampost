'use strict';

/**
 * Every per-platform option the API takes (`PostOptions` in the OpenAPI spec) and the top-level
 * `thread` and `mediaFit` must have a real field in the node, so a new API option cannot be
 * forgotten. The spec is the SDK's copy (`../ampost-node/openapi.json`), refreshed by CI in the
 * Ampost repo; in the mirrored repo, where it is missing, the test is skipped.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Ampost } = require('../dist/nodes/Ampost/Ampost.node');

const SPEC_PATH = path.join(__dirname, '..', '..', 'ampost-node', 'openapi.json');
const spec = fs.existsSync(SPEC_PATH) ? JSON.parse(fs.readFileSync(SPEC_PATH, 'utf8')) : null;
const skip = spec ? false : `no OpenAPI spec at ${SPEC_PATH}`;

function deref(schema) {
	if (!schema || !schema.$ref) return schema;
	return spec.components.schemas[schema.$ref.split('/').pop()];
}

const properties = new Ampost().description.properties;
const platformOptions = properties.find((property) => property.name === 'platformOptions');
const additionalFields = properties.find((property) => property.name === 'additionalFields');

test('every PostOptions field of the API has a Platform Options field', { skip }, () => {
	const fieldNames = new Set(platformOptions.options.map((option) => option.name));
	const missing = [];
	const postOptions = deref(spec.components.schemas.PostOptions);
	for (const [platform, platformSchema] of Object.entries(postOptions.properties)) {
		for (const field of Object.keys(deref(platformSchema).properties ?? {})) {
			if (!fieldNames.has(`${platform}__${field}`)) missing.push(`${platform}.${field}`);
		}
	}
	assert.deepEqual(missing, [], `options without a field: ${missing.join(', ')}`);
});

test('no Platform Options field is unknown to the API', { skip }, () => {
	const postOptions = deref(spec.components.schemas.PostOptions);
	const unknown = platformOptions.options
		.map((option) => option.name.split('__'))
		.filter(([platform, field]) => {
			const platformSchema = deref(postOptions.properties[platform]);
			return !platformSchema || !(field in (platformSchema.properties ?? {}));
		})
		.map((parts) => parts.join('.'));
	assert.deepEqual(unknown, []);
});

test('the top-level thread and mediaFit have fields', { skip }, () => {
	const request = spec.components.schemas.CreatePostRequest.properties;
	const names = new Set(additionalFields.options.map((option) => option.name));
	for (const key of ['thread', 'mediaFit']) {
		assert.ok(key in request, `${key} is not in CreatePostRequest any more`);
		assert.ok(names.has(key), `Additional Fields has no ${key}`);
	}
	const threadItem = deref(spec.components.schemas.ThreadItemInput).properties;
	assert.deepEqual(Object.keys(threadItem).sort(), ['media', 'text']);
	assert.deepEqual(Object.keys(threadItem.media.items.properties).sort(), [
		'altText',
		'type',
		'url',
	]);
});
