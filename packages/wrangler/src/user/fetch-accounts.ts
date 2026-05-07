import { configFileName, UserError } from "@cloudflare/workers-utils";
import { fetchPagedListResult } from "../cfetch";
import type { Account } from "./shared";
import type { ComplianceConfig } from "@cloudflare/workers-utils";

// Cloudflare API error codes returned by `/memberships` that mean "the
// current auth cannot read memberships".
//   - 9109 (Insufficient permissions): structural for Account API Tokens,
//     which cannot read user-level memberships at all.
//   - 10000 (Authentication error): the token is not accepted by the
//     `/memberships` endpoint, but `/accounts` may still work for the same
//     auth (e.g. tokens missing the membership read scope).
const MEMBERSHIPS_INACCESSIBLE_CODES = [9109, 10000];

// Cloudflare API error codes that indicate the credentials supplied are
// missing or structurally invalid (not merely lacking permissions).
//   - 9106: "Missing X-Auth-Key, X-Auth-Email or Authorization headers" —
//     occurs when an environment variable like CLOUDFLARE_API_TOKEN is set
//     to an empty or malformed value that the API rejects outright.
const MEMBERSHIPS_BAD_CREDENTIALS_CODES = [9106];

function isMembershipsInaccessible(err: unknown): boolean {
	const code = (err as { code?: number } | undefined)?.code;
	return code !== undefined && MEMBERSHIPS_INACCESSIBLE_CODES.includes(code);
}

function isBadCredentials(err: unknown): boolean {
	const code = (err as { code?: number } | undefined)?.code;
	return code !== undefined && MEMBERSHIPS_BAD_CREDENTIALS_CODES.includes(code);
}

/**
 * Fetches the set of accounts that the current login auth can actually use.
 *
 * The list is the intersection of two endpoints:
 *  - `/accounts` — accounts to which the authenticated token has access.
 *  - `/memberships` — accounts of which the authenticated token is a member.
 *
 * This avoids displaying accounts that the current credentials cannot meaningfully use.
 *
 * If `/memberships` returns a code that indicates it is inaccessible to the
 * current auth — 9109 (Insufficient permissions) or 10000 (Authentication
 * error) — we fall back to the `/accounts` response, which is itself scoped
 * to what the auth can access. Any other failure on either endpoint is
 * propagated so the underlying API error reaches the user.
 *
 * @param complianceConfig - The compliance configuration for API requests
 * @param options - Optional flags controlling empty-result handling
 * @returns The list of accounts the current login auth has access to
 * @throws {UserError} If no accounts are found and `throwOnEmpty` is `true`
 * @throws {UserError} If `/memberships` is inaccessible and `/accounts` is unusable
 */
export async function fetchAllAccounts(
	complianceConfig: ComplianceConfig,
	options: {
		/**
		 * Whether to throw an error if no accounts are found for the current login auth.
		 *
		 * @default true
		 */
		throwOnEmpty?: boolean;
	} = {}
): Promise<Account[]> {
	const { throwOnEmpty = true } = options;

	const [accountsRes, membershipsRes] = await Promise.allSettled([
		fetchPagedListResult<Account>(complianceConfig, `/accounts`),
		fetchPagedListResult<{ account: Account }>(
			complianceConfig,
			`/memberships`
		),
	]);

	if (accountsRes.status === "rejected") {
		throw accountsRes.reason;
	}

	if (membershipsRes.status === "rejected") {
		if (isMembershipsInaccessible(membershipsRes.reason)) {
			if (accountsRes.status === "fulfilled" && accountsRes.value.length > 0) {
				// Fall back to `/accounts`, which is already scoped to what the auth can use.
				return accountsRes.value;
			}
			throw new UserError(
				`Failed to automatically retrieve account IDs for the logged in user.
You may have incorrect permissions on your API token. You can skip this account check by adding an \`account_id\` in your ${configFileName(undefined)} file, or by setting the value of CLOUDFLARE_ACCOUNT_ID`,
				{ telemetryMessage: "user account fetch permission denied" }
			);
		} else if (isBadCredentials(membershipsRes.reason)) {
			throw new UserError(
				`Authentication failed when calling the Cloudflare API (/memberships).
An environment variable such as CLOUDFLARE_API_TOKEN, CLOUDFLARE_API_KEY, or CLOUDFLARE_EMAIL may be set to an invalid value.
Check your environment and unset or correct any Cloudflare credential variables, then try again.
You can also run \`wrangler logout\` followed by \`wrangler login\` to re-authenticate.`,
				{ telemetryMessage: "user account fetch bad credentials" }
			);
		} else {
			throw membershipsRes.reason;
		}
	}

	const membershipIds = new Set(membershipsRes.value.map((m) => m.account.id));
	const usableAccounts = accountsRes.value.filter((a) =>
		membershipIds.has(a.id)
	);

	if (usableAccounts.length === 0 && throwOnEmpty) {
		throw new UserError(
			`Failed to automatically retrieve account IDs for the logged in user.
In a non-interactive environment, it is mandatory to specify an account ID, either by assigning its value to CLOUDFLARE_ACCOUNT_ID, or as \`account_id\` in your ${configFileName(undefined)} file.`,
			{ telemetryMessage: "user account fetch empty" }
		);
	}

	return usableAccounts;
}
