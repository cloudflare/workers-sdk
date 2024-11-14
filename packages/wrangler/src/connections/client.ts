import { fetchResult } from "../cfetch";

export type ConnectionNamespace = {
	name: string;
	connections: ConnectionEntry[];
};
export type ConnectionEntry = {
	name: string;
	claimed: boolean;
};
export type ConnectionBinding = {
	name: string;
	target_script: string;
	entrypoint: string;
	args?: Record<string, unknown>;
};

export async function listProviderNamespaces(accountId: string) {
	return await fetchResult<ConnectionNamespace[]>(
		`/accounts/${accountId}/workers/connections/provider`,
		{
			method: "GET",
		}
	);
}
export async function createConnectionNamespace(
	accountId: string,
	namespace: string
) {
	return await fetchResult<ConnectionEntry[]>(
		`/accounts/${accountId}/workers/connections/provider/${namespace}`,
		{
			method: "PUT",
		}
	);
}

export async function createConnection(
	accountId: string,
	namespace: string,
	connectionName: string,
	metadata: Record<string, unknown>,
	domain: string | undefined,
	resources: ConnectionBinding[]
) {
	return await fetchResult<{ token: string }>(
		`/accounts/${accountId}/workers/connections/provider/${namespace}/${connectionName}`,
		{
			method: "PUT",
			body: JSON.stringify({
				metadata,
				domain,
				resources,
			}),
		}
	);
}

export async function verifyToken(accountId: string, token: string) {
	return await fetchResult<{ metadata: Record<string, unknown> }>(
		`/accounts/${accountId}/workers/connections/verify`,
		{
			method: "POST",
			body: JSON.stringify({ token }),
		}
	);
}

export async function claimConnection(
	accountId: string,
	token: string,
	alias: string
) {
	return await fetchResult<{ metadata: Record<string, unknown> }>(
		`/accounts/${accountId}/workers/connections/consumer/${alias}`,
		{
			method: "PUT",
			body: JSON.stringify({ token }),
		}
	);
}

export async function getConnectionNamespace(
	accountId: string,
	namespace: string
) {
	return await fetchResult<ConnectionNamespace>(
		`/accounts/${accountId}/workers/connections/provider/${namespace}`,
		{
			method: "GET",
		}
	);
}

export async function listConsumerConnections(accountId: string) {
	return await fetchResult<ConnectionEntry[]>(
		`/accounts/${accountId}/workers/connections/consumer`,
		{
			method: "GET",
		}
	);
}

export async function updateHooks(
	accountId: string,
	alias: string,
	hooks: ConnectionBinding[]
) {
	return await fetchResult<ConnectionEntry[]>(
		`/accounts/${accountId}/workers/connections/consumer/${alias}/hooks`,
		{
			method: "POST",
			body: JSON.stringify(hooks),
		}
	);
}
