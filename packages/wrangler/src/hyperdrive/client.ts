import { fetchResult } from "../cfetch";
import { requireAuth } from "../user";
import type { Config } from "../config";

export type HyperdriveConfig = {
	id: string;
	name: string;
	origin: PublicOrigin;
	caching: CachingOptions;
};

export type OriginCommon = {
	host: string;
	scheme: string;
	database: string;
	user: string;
};

export type OriginCommonWithSecrets = OriginCommon & {
	password: string;
};

export type OriginHoA = OriginCommon & {
	access_client_id: string;
	access_client_secret?: never;
	port?: never;
};

export type OriginHoAWithSecrets = OriginCommonWithSecrets & {
	access_client_id: string;
	access_client_secret: string;
	port?: never;
};

export type OriginHostAndPort = OriginCommon & {
	access_client_id?: never;
	access_client_secret?: never;
	port: number;
};

export type OriginHostAndPortWithSecrets = OriginCommonWithSecrets & {
	access_client_id?: never;
	access_client_secret?: never;
	port: number;
};

export type PublicOrigin = OriginHostAndPort | OriginHoA;
export type OriginWithSecrets =
	| OriginHostAndPortWithSecrets
	| OriginHoAWithSecrets;

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

export async function updateConfig(
	config: Config,
	id: string,
	body: CreateUpdateHyperdriveBody
): Promise<HyperdriveConfig> {
	const accountId = await requireAuth(config);
	return await fetchResult(`/accounts/${accountId}/hyperdrive/configs/${id}`, {
		method: "PUT",
		body: JSON.stringify(body),
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
