import { APIError, type ComplianceConfig } from "@cloudflare/workers-utils";
import { createNamespaceRequest, getNamespaceRequest } from "./client";
import type { AgentMemoryNamespace } from "./client";

/**
 * Get an Agent Memory namespace for the given account.
 * Returns `null` if the namespace does not exist (404); other errors propagate.
 *
 * Used by the provisioning system at deploy time to decide whether a
 * configured namespace needs to be created. The caller (not this function)
 * is responsible for provisioning when `null` is returned.
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
