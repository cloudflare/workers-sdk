import { configFileName, UserError } from "@cloudflare/workers-utils";
import { fetchPagedListResult } from "../cfetch";
import type { Account } from "./shared";
import type { ComplianceConfig } from "@cloudflare/workers-utils";

/**
 * Fetches all accounts accessible to the currently authenticated user.
 *
 * Makes an API call to the `/memberships` endpoint and returns
 * the list of accounts associated with the current credentials.
 *
 * @param complianceConfig - The compliance configuration for API requests
 * @returns The list of accounts the user has access to
 * @throws {UserError} If no accounts are found for the authenticated user
 * @throws {UserError} If the API returns a 9109 error (insufficient permissions)
 */
export async function fetchAllAccounts(
	complianceConfig: ComplianceConfig
): Promise<Account[]> {
	try {
		const response = await fetchPagedListResult<{
			account: Account;
		}>(complianceConfig, `/memberships`);
		const accounts = response.map((r) => r.account);
		if (accounts.length === 0) {
			throw new UserError(
				`Failed to automatically retrieve account IDs for the logged in user.
In a non-interactive environment, it is mandatory to specify an account ID, either by assigning its value to CLOUDFLARE_ACCOUNT_ID, or as \`account_id\` in your ${configFileName(undefined)} file.`
			);
		}
		return accounts;
	} catch (err) {
		if ((err as { code: number }).code === 9109) {
			throw new UserError(
				`Failed to automatically retrieve account IDs for the logged in user.
You may have incorrect permissions on your API token. You can skip this account check by adding an \`account_id\` in your ${configFileName(undefined)} file, or by setting the value of CLOUDFLARE_ACCOUNT_ID"`
			);
		}
		throw err;
	}
}
