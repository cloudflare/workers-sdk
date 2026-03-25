import { fetchResult } from "./cfetch";
import type { ComplianceConfig } from "@cloudflare/workers-utils";

export interface AISearchNamespace {
	name: string;
}

/**
 * Get an AI Search namespace for the given account.
 * Throws an APIError (status 404) if the namespace does not exist.
 */
export async function getAISearchNamespace(
	complianceConfig: ComplianceConfig,
	accountId: string,
	namespaceName: string
): Promise<AISearchNamespace> {
	return await fetchResult<AISearchNamespace>(
		complianceConfig,
		`/accounts/${accountId}/ai-search/namespaces/${namespaceName}`,
		{ method: "GET" }
	);
}

/**
 * Create an AI Search namespace for the given account.
 * Used by the provisioning system (R2 bucket pattern) when a namespace
 * doesn't exist at deploy time.
 */
export async function createAISearchNamespace(
	complianceConfig: ComplianceConfig,
	accountId: string,
	namespaceName: string
): Promise<void> {
	await fetchResult<void>(
		complianceConfig,
		`/accounts/${accountId}/ai-search/namespaces`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name: namespaceName }),
		}
	);
}
