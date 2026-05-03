import { APIError, type ComplianceConfig } from "@cloudflare/workers-utils";
import { fetchResult } from "./cfetch";

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
): Promise<AISearchNamespace | null> {
	try {
		return await fetchResult<AISearchNamespace>(
			complianceConfig,
			`/accounts/${accountId}/ai-search/namespaces/${namespaceName}`,
			{ method: "GET" }
		);
	} catch (e) {
		if (e instanceof APIError && e.status === 404) {
			// Namespace does not exist — provision it
			return null;
		}
		throw e;
	}
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
