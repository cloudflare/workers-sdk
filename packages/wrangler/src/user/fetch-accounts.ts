import { configFileName, UserError } from "@cloudflare/workers-utils";
import { fetchPagedListResult } from "../cfetch";
import type { Account } from "./shared";
import type { ComplianceConfig } from "@cloudflare/workers-utils";

// Cloudflare API error codes returned by `/memberships` that mean "the
// current auth cannot read memberships". When `/memberships` fails with one
// of these we fall back to `/accounts` so the user is not blocked by an
// auth-specific limitation on a single endpoint:
//   - 9109 (Insufficient permissions): structural for Account API Tokens,
//     which cannot read user-level memberships at all.
//   - 10000 (Authentication error): the token is not accepted by the
//     `/memberships` endpoint, but `/accounts` may still work for the same
//     auth (e.g. tokens missing the membership read scope).
const MEMBERSHIPS_INACCESSIBLE_CODES = new Set([9109, 10000]);

function isMembershipsInaccessible(err: unknown): boolean {
	const code = (err as { code?: number } | undefined)?.code;
	return code !== undefined && MEMBERSHIPS_INACCESSIBLE_CODES.has(code);
}

export interface FetchAllAccountsOptions {
	/**
	 * When `true` (the default), this throws a `UserError` if no accounts are
	 * available for the current login auth. When `false`, it returns an empty
	 * array in that case so the caller can render an empty list instead of
	 * failing loudly. Use `false` for informational commands like `wrangler
	 * whoami`; use `true` (default) for command flows that depend on having
	 * at least one account, such as account selection.
	 */
	throwOnEmpty?: boolean;
}

/**
 * Fetches the set of accounts that the current login auth can actually use.
 *
 * The list is the intersection of two endpoints:
 *  - `/accounts` — accounts the authenticated principal has access to
 *  - `/memberships` — accounts the authenticated principal has a membership in
 *
 * Intersecting these two avoids displaying accounts that the current credentials
 * cannot meaningfully use. Account metadata (e.g. name) is taken from `/accounts`.
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
	options: FetchAllAccountsOptions = {}
): Promise<Account[]> {
	const { throwOnEmpty = true } = options;

	const [accountsRes, membershipsRes] = await Promise.allSettled([
		fetchPagedListResult<Account>(complianceConfig, `/accounts`),
		fetchPagedListResult<{ account: Account }>(
			complianceConfig,
			`/memberships`
		),
	]);

	// `/memberships` is inaccessible for this auth (e.g. Account API Tokens
	// hit 9109; tokens missing the membership read scope hit 10000). Fall
	// back to `/accounts`, which is already scoped to what the auth can use.
	if (
		membershipsRes.status === "rejected" &&
		isMembershipsInaccessible(membershipsRes.reason)
	) {
		if (accountsRes.status === "fulfilled" && accountsRes.value.length > 0) {
			return accountsRes.value;
		}
		throw new UserError(
			`Failed to automatically retrieve account IDs for the logged in user.
You may have incorrect permissions on your API token. You can skip this account check by adding an \`account_id\` in your ${configFileName(undefined)} file, or by setting the value of CLOUDFLARE_ACCOUNT_ID`,
			{ telemetryMessage: "user account fetch permission denied" }
		);
	}

	// Any other failure on either endpoint is a real failure — surface it so
	// the user can see the underlying API error.
	if (membershipsRes.status === "rejected") {
		throw membershipsRes.reason;
	}
	if (accountsRes.status === "rejected") {
		throw accountsRes.reason;
	}

	const membershipIds = new Set(membershipsRes.value.map((m) => m.account.id));
	const intersection = accountsRes.value.filter((a) => membershipIds.has(a.id));

	if (intersection.length === 0 && throwOnEmpty) {
		throw new UserError(
			`Failed to automatically retrieve account IDs for the logged in user.
In a non-interactive environment, it is mandatory to specify an account ID, either by assigning its value to CLOUDFLARE_ACCOUNT_ID, or as \`account_id\` in your ${configFileName(undefined)} file.`,
			{ telemetryMessage: "user account fetch empty" }
		);
	}

	return intersection;
}
