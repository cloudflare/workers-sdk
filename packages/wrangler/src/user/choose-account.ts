import { configFileName, UserError } from "@cloudflare/workers-utils";
import { fetchPagedListResult } from "../cfetch";
import { getCloudflareAccountIdFromEnv } from "./auth-variables";
import type { Account } from "./shared";
import type { ComplianceConfig } from "@cloudflare/workers-utils";

/**
 * Infer a list of available accounts for the current user.
 */
export async function getAccountChoices(
	complianceConfig: ComplianceConfig
): Promise<Account[]> {
	const accountIdFromEnv = getCloudflareAccountIdFromEnv();
	if (accountIdFromEnv) {
		return [{ id: accountIdFromEnv, name: "" }];
	} else {
		try {
			const response = await fetchPagedListResult<{
				account: Account;
			}>(complianceConfig, `/memberships`);
			const accounts = response.map((r) => r.account);
			if (accounts.length === 0) {
				throw new UserError(
					"Failed to automatically retrieve account IDs for the logged in user.\n" +
						`In a non-interactive environment, it is mandatory to specify an account ID, either by assigning its value to CLOUDFLARE_ACCOUNT_ID, or as \`account_id\` in your ${configFileName(undefined)} file.`
				);
			} else {
				return accounts;
			}
		} catch (err) {
			if ((err as { code: number }).code === 9109) {
				throw new UserError(
					`Failed to automatically retrieve account IDs for the logged in user.
You may have incorrect permissions on your API token. You can skip this account check by adding an \`account_id\` in your ${configFileName(undefined)} file, or by setting the value of CLOUDFLARE_ACCOUNT_ID"`
				);
			} else {
				throw err;
			}
		}
	}
}
