import { fetchResult } from "./fetch";
import type { AuthCredentials } from "../types";

/**
 * Get the workers.dev subdomain for an account.
 */
export async function getWorkersDevSubdomain(
	auth: AuthCredentials,
	complianceRegion?: string
): Promise<string> {
	const result = await fetchResult<{ subdomain: string }>(
		auth,
		`/accounts/${auth.accountId}/workers/subdomain`,
		undefined,
		complianceRegion
	);
	return result.subdomain;
}
