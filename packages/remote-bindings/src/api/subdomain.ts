import { fetchResult } from "./fetch";
import type { Logger } from "../logger";
import type { AuthCredentials } from "../types";

/**
 * Get the workers.dev subdomain for an account.
 */
export async function getWorkersDevSubdomain(
	auth: AuthCredentials,
	complianceRegion: string | undefined,
	logger: Logger
): Promise<string> {
	const result = await fetchResult<{ subdomain: string }>(
		auth,
		`/accounts/${auth.accountId}/workers/subdomain`,
		undefined,
		complianceRegion,
		logger
	);
	return result.subdomain;
}
