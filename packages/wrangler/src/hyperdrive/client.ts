import { fetchResult } from "../cfetch";
import { requireAuth } from "../user";
import type { Config } from "../config";

export type HyperdriveDatabase = {
	id: string;
	name: string;
	origin: PublicOrigin;
};

export type Origin = {
	host?: string;
	port?: number;
};

export type PublicOrigin = Origin & {
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

export async function createDatabase(
	config: Config,
	body: CreateUpdateHyperdriveBody
): Promise<HyperdriveDatabase> {
	const accountId = await requireAuth(config);
	return await fetchResult(`/accounts/${accountId}/query_cache/databases`, {
		method: "POST",
		body: JSON.stringify(body),
	});
}

export async function deleteDatabase(
	config: Config,
	id: string
): Promise<void> {
	const accountId = await requireAuth(config);
	return await fetchResult(
		`/accounts/${accountId}/query_cache/databases/${id}`,
		{
			method: "DELETE",
		}
	);
}

export async function getDatabase(
	config: Config,
	id: string
): Promise<HyperdriveDatabase> {
	const accountId = await requireAuth(config);
	return await fetchResult(
		`/accounts/${accountId}/query_cache/databases/${id}`,
		{
			method: "GET",
		}
	);
}

export async function listDatabases(
	config: Config
): Promise<HyperdriveDatabase[]> {
	const accountId = await requireAuth(config);
	return await fetchResult(`/accounts/${accountId}/query_cache/databases`, {
		method: "GET",
	});
}

export async function updateDatabase(
	config: Config,
	id: string,
	body: CreateUpdateHyperdriveBody
): Promise<HyperdriveDatabase> {
	const accountId = await requireAuth(config);
	return await fetchResult(
		`/accounts/${accountId}/query_cache/databases/${id}`,
		{
			method: "PUT",
			body: JSON.stringify(body),
		}
	);
}
