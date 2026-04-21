import { fetchListResult, fetchResult } from "../cfetch";
import { requireAuth } from "../user";
import type { ComplianceConfig, Config } from "@cloudflare/workers-utils";

export type AgentMemoryNamespace = {
	id: string;
	name: string;
	account_id: string;
	created_at: string;
	updated_at: string;
};

// ============================================================================
// Low-level request helpers
//
// These take a ComplianceConfig + accountId directly and perform the raw HTTP
// call. They are shared between the high-level command wrappers below and the
// provisioning flow (see agent-memory/provisioning.ts), which already has an
// accountId in hand and cannot call requireAuth.
// ============================================================================

export async function createNamespaceRequest(
	complianceConfig: ComplianceConfig,
	accountId: string,
	name: string
): Promise<AgentMemoryNamespace> {
	return await fetchResult<AgentMemoryNamespace>(
		complianceConfig,
		`/accounts/${accountId}/agentmemory/namespaces`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name }),
		}
	);
}

export async function listNamespacesRequest(
	complianceConfig: ComplianceConfig,
	accountId: string
): Promise<AgentMemoryNamespace[]> {
	return await fetchListResult<AgentMemoryNamespace>(
		complianceConfig,
		`/accounts/${accountId}/agentmemory/namespaces`
	);
}

export async function getNamespaceRequest(
	complianceConfig: ComplianceConfig,
	accountId: string,
	namespaceName: string
): Promise<AgentMemoryNamespace> {
	return await fetchResult<AgentMemoryNamespace>(
		complianceConfig,
		`/accounts/${accountId}/agentmemory/namespaces/${namespaceName}`
	);
}

export async function deleteNamespaceRequest(
	complianceConfig: ComplianceConfig,
	accountId: string,
	namespaceName: string
): Promise<void> {
	await fetchResult<void>(
		complianceConfig,
		`/accounts/${accountId}/agentmemory/namespaces/${namespaceName}`,
		{ method: "DELETE" }
	);
}

// ============================================================================
// High-level command wrappers
//
// Used by the `wrangler agent-memory namespace …` commands. Each resolves the
// account id via requireAuth and delegates to the low-level helper above.
// ============================================================================

export async function createNamespace(
	config: Config,
	name: string
): Promise<AgentMemoryNamespace> {
	const accountId = await requireAuth(config);
	return await createNamespaceRequest(config, accountId, name);
}

export async function listNamespaces(
	config: Config
): Promise<AgentMemoryNamespace[]> {
	const accountId = await requireAuth(config);
	return await listNamespacesRequest(config, accountId);
}

export async function getNamespace(
	config: Config,
	namespaceName: string
): Promise<AgentMemoryNamespace> {
	const accountId = await requireAuth(config);
	return await getNamespaceRequest(config, accountId, namespaceName);
}

export async function deleteNamespace(
	config: Config,
	namespaceName: string
): Promise<void> {
	const accountId = await requireAuth(config);
	await deleteNamespaceRequest(config, accountId, namespaceName);
}
