'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { NodeHelpers } = require('n8n-workflow');
const { Ampost } = require('../dist/nodes/Ampost/Ampost.node');
const { AmpostTrigger } = require('../dist/nodes/AmpostTrigger/AmpostTrigger.node');

const dir = path.join(__dirname, '..', 'templates');
const files = fs.readdirSync(dir).filter((file) => file.endsWith('.json'));
const descriptions = {
	'n8n-nodes-ampost.ampost': new Ampost().description,
	'n8n-nodes-ampost.ampostTrigger': new AmpostTrigger().description,
};

test('there are templates', () => {
	assert.ok(files.length >= 5);
});

for (const file of files) {
	test(`template ${file}`, () => {
		const workflow = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
		assert.ok(workflow.name, 'has a name');
		const names = new Set(workflow.nodes.map((node) => node.name));
		assert.equal(names.size, workflow.nodes.length, 'node names are unique');

		for (const [from, connection] of Object.entries(workflow.connections)) {
			assert.ok(names.has(from), `connection from unknown node ${from}`);
			for (const output of connection.main)
				for (const target of output)
					assert.ok(names.has(target.node), `connection to ${target.node}`);
		}

		const sticky = workflow.nodes.find((node) => node.type === 'n8n-nodes-base.stickyNote');
		assert.match(sticky?.parameters.content ?? '', /### Setup/, 'a sticky note explains the setup');

		const ampostNodes = workflow.nodes.filter((node) => descriptions[node.type]);
		assert.ok(ampostNodes.length > 0, 'uses the Ampost node');
		for (const node of ampostNodes) {
			const description = descriptions[node.type];
			assert.equal(node.typeVersion, description.version);
			assert.deepEqual(
				Object.keys(node.credentials ?? {}),
				['ampostApi'],
				`${node.name} credential`,
			);
			const withDefaults = NodeHelpers.getNodeParameters(
				description.properties,
				node.parameters,
				true,
				false,
				node,
				description,
			);
			for (const key of Object.keys(node.parameters)) {
				assert.ok(key in withDefaults, `${node.name}: ${key} is not a parameter here`);
			}
			const issues = NodeHelpers.getNodeParametersIssues(
				description.properties,
				{ ...node, parameters: withDefaults },
				description,
			);
			assert.equal(issues, null, `${node.name}: ${JSON.stringify(issues)}`);
		}

		// Templates never carry a key.
		assert.doesNotMatch(JSON.stringify(workflow), /amp_live_|amp_test_|whsec_/);
	});
}
