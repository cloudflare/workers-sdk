import { fetchResult } from "../cfetch";
import { requireAuth } from "../user";
import type { Config } from "../config";

export type HyperdriveConfig = {
	id: string;
	name: string;
	origin: PublicOrigin;
	caching: CachingOptions;
};

export type PublicOrigin = {
	host?: string;
	port?: number;
	scheme?: string;
	database?: string;
	user?: string;
	access_client_id?: string;
};

export type OriginWithSecrets = PublicOrigin & {
	password?: string;
	access_client_secret?: string;
};

export type CachingOptions = {
	disabled?: boolean;
	max_age?: number;
	stale_while_revalidate?: number;
};

export type CreateUpdateHyperdriveBody = {
	name: string;
	origin: OriginWithSecrets;
	caching: CachingOptions;
};

export type PatchHyperdriveBody = {
	name?: string;
	origin?: OriginWithSecrets;
	caching?: CachingOptions;
};

export async function createConfig(
	config: Config,
	body: CreateUpdateHyperdriveBody
): Promise<HyperdriveConfig> {
	const accountId = await requireAuth(config);
	return await fetchResult(`/accounts/${accountId}/hyperdrive/configs`, {
		method: "POST",
		body: JSON.stringify(body),
	});
}

export async function deleteConfig(config: Config, id: string): Promise<void> {
	const accountId = await requireAuth(config);
	return await fetchResult(`/accounts/${accountId}/hyperdrive/configs/${id}`, {
		method: "DELETE",
	});
}

export async function getConfig(
	config: Config,
	id: string
): Promise<HyperdriveConfig> {
	const accountId = await requireAuth(config);
	return await fetchResult(`/accounts/${accountId}/hyperdrive/configs/${id}`, {
		method: "GET",
	});
}

export async function listConfigs(config: Config): Promise<HyperdriveConfig[]> {
	const accountId = await requireAuth(config);
	return await fetchResult(`/accounts/${accountId}/hyperdrive/configs`, {
		method: "GET",
	});
}

export async function patchConfig(
	config: Config,
	id: string,
	body: PatchHyperdriveBody
): Promise<HyperdriveConfig> {
	const accountId = await requireAuth(config);
	return await fetchResult(`/accounts/${accountId}/hyperdrive/configs/${id}`, {
		method: "PATCH",
		body: JSON.stringify(body),
	});
}
