import { fetchResult } from "../cfetch";
import { requireAuth } from "../user";
import type { Config } from "../config";

export type HyperdriveConfig = {
	id: string;
	name: string;
	origin: PublicOrigin;
};

export type Origin = {
	host?: string;
	port?: number;
};

export type PublicOrigin = Origin & {
	scheme?: string;
	database?: string;
	user?: string;
};

export type OriginWithPassword = PublicOrigin & {
	password?: string;
};

export type CreateUpdateHyperdriveBody = {
	name?: string;
	origin: OriginWithPassword;
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
