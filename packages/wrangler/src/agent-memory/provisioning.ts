import { APIError, type ComplianceConfig } from "@cloudflare/workers-utils";
import { createNamespaceRequest, getNamespaceRequest } from "./client";
import type { AgentMemoryNamespace } from "./client";

/**
 * Get an Agent Memory namespace for the given account.
 * Returns `null` if the namespace does not exist (404); other errors propagate.
 */
export async function getAgentMemoryNamespace(
	complianceConfig: ComplianceConfig,
	accountId: string,
	namespaceName: string
): Promise<AgentMemoryNamespace | null> {
	try {
		return await getNamespaceRequest(
			complianceConfig,
			accountId,
			namespaceName
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
	await createNamespaceRequest(complianceConfig, accountId, namespaceName);
}
