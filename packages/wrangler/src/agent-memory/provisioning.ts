import { APIError, type ComplianceConfig } from "@cloudflare/workers-utils";
import { fetchResult } from "../cfetch";

export interface AgentMemoryNamespace {
	id: string;
	name: string;
}

/**
 * Get an Agent Memory namespace for the given account.
 * Throws an APIError (status 404) if the namespace does not exist.
 */
export async function getAgentMemoryNamespace(
	complianceConfig: ComplianceConfig,
	accountId: string,
	namespaceName: string
): Promise<AgentMemoryNamespace | null> {
	try {
		return await fetchResult<AgentMemoryNamespace>(
			complianceConfig,
			`/accounts/${accountId}/agentmemory/namespaces/${namespaceName}`,
			{ method: "GET" }
		);
	} catch (e) {
		if (e instanceof APIError && e.status === 404) {
			// Namespace does not exist - provision it
			return null;
		}
		throw e;
	}
}

/**
 * Create an Agent Memory namespace for the given account.
 * Used by the provisioning system when a namespace doesn't exist at deploy time.
 */
export async function createAgentMemoryNamespace(
	complianceConfig: ComplianceConfig,
	accountId: string,
	namespaceName: string
): Promise<void> {
	await fetchResult<void>(
		complianceConfig,
		`/accounts/${accountId}/agentmemory/namespaces`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name: namespaceName }),
		}
	);
}
