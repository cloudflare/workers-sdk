import { fetchListResult, fetchResult } from "../cfetch";
import { requireAuth } from "../user";
import type { Config } from "@cloudflare/workers-utils";

export type AgentMemoryNamespace = {
	id: string;
	name: string;
	account_id: string;
	created_at: string;
	updated_at: string;
};

export async function createNamespace(
	config: Config,
	name: string
): Promise<AgentMemoryNamespace> {
	const accountId = await requireAuth(config);
	return await fetchResult<AgentMemoryNamespace>(
		config,
		`/accounts/${accountId}/agentmemory/namespaces`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name }),
		}
	);
}

export async function listNamespaces(
	config: Config
): Promise<AgentMemoryNamespace[]> {
	const accountId = await requireAuth(config);
	return await fetchListResult<AgentMemoryNamespace>(
		config,
		`/accounts/${accountId}/agentmemory/namespaces`
	);
}

export async function getNamespace(
	config: Config,
	namespaceId: string
): Promise<AgentMemoryNamespace> {
	const accountId = await requireAuth(config);
	return await fetchResult<AgentMemoryNamespace>(
		config,
		`/accounts/${accountId}/agentmemory/namespaces/${namespaceId}`
	);
}

export async function deleteNamespace(
	config: Config,
	namespaceId: string
): Promise<void> {
	const accountId = await requireAuth(config);
	await fetchResult<null>(
		config,
		`/accounts/${accountId}/agentmemory/namespaces/${namespaceId}`,
		{ method: "DELETE" }
	);
}
