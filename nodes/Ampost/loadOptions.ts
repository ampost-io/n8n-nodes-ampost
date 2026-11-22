import type { IDataObject, ILoadOptionsFunctions, INodePropertyOptions } from 'n8n-workflow';
import { PLATFORM_OPTIONS } from './descriptions/shared';
import { ampostApiRequestAllItems } from './transport';

const platformLabel = (platform: unknown): string =>
	String(PLATFORM_OPTIONS.find((option) => option.value === platform)?.name ?? platform);

const accountLabel = (account: IDataObject): string => {
	const handle = account.username ? `@${String(account.username)}` : String(account.id);
	return `${platformLabel(account.platform)}: ${handle}`;
};

async function listPlatformSets(this: ILoadOptionsFunctions): Promise<IDataObject[]> {
	return ampostApiRequestAllItems.call(this, '/api/platform-sets');
}

export async function getPlatformSets(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	const sets = await listPlatformSets.call(this);
	return sets.map((set) => ({
		name: set.isDefault ? `${String(set.name)} (default)` : String(set.name),
		value: String(set.id),
	}));
}

/** The platforms that have an active account in the chosen set (the default set when none is chosen). */
export async function getPlatforms(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	let platformSetId = this.getCurrentNodeParameter('platformSetId') as string | undefined;
	if (!platformSetId) {
		const sets = await listPlatformSets.call(this);
		platformSetId = sets.find((set) => set.isDefault)?.id as string | undefined;
		if (!platformSetId) return [];
	}
	const accounts = await ampostApiRequestAllItems.call(this, '/api/accounts', {
		platformSetId,
		status: 'active',
	});
	return accounts
		.map((account) => ({ name: accountLabel(account), value: String(account.platform) }))
		.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getAccounts(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const accounts = await ampostApiRequestAllItems.call(this, '/api/accounts', { status: 'all' });
	return accounts
		.map((account) => ({
			name:
				account.status === 'revoked'
					? `${accountLabel(account)} (disconnected)`
					: accountLabel(account),
			value: String(account.id),
		}))
		.sort((a, b) => a.name.localeCompare(b.name));
}
