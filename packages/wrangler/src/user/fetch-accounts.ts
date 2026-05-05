import { configFileName, UserError } from "@cloudflare/workers-utils";
import { fetchPagedListResult } from "../cfetch";
import type { Account } from "./shared";
import type { ComplianceConfig } from "@cloudflare/workers-utils";

const INSUFFICIENT_PERMISSIONS_CODE = 9109;

function isCode(err: unknown, code: number): boolean {
	return (err as { code?: number } | undefined)?.code === code;
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
	/**
	 * When `true`, falls back to the `/accounts` response if `/memberships`
	 * fails for *any* reason (not just 9109). When `false` (the default), only
	 * a 9109 (Insufficient permissions) failure on `/memberships` triggers the
	 * fallback — other errors propagate. Use `true` for informational commands
	 * like `wrangler whoami` that should be tolerant to any `/memberships` outage.
	 * Use `false` (the default) for flows where the auth-scoped list must be authoritative.
	 */
	permissive?: boolean;
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
 * For Account API Tokens, `/memberships` returns a 9109 (Insufficient permissions)
 * error because the token does not have user-level membership read permission. In
 * that case we fall back to the `/accounts` response, which itself is already
 * scoped to the single account that the token can access.
 *
 * @param complianceConfig - The compliance configuration for API requests
 * @param options - Optional flags controlling empty-result and error handling
 * @returns The list of accounts the current login auth has access to
 * @throws {UserError} If no accounts are found and `throwOnEmpty` is `true`
 * @throws {UserError} If `/memberships` returns 9109 and `/accounts` is unusable
 */
export async function fetchAllAccounts(
	complianceConfig: ComplianceConfig,
	options: FetchAllAccountsOptions = {}
): Promise<Account[]> {
	const { throwOnEmpty = true, permissive = false } = options;

	const [accountsRes, membershipsRes] = await Promise.allSettled([
		fetchPagedListResult<Account>(complianceConfig, `/accounts`),
		fetchPagedListResult<{ account: Account }>(
			complianceConfig,
			`/memberships`
		),
	]);

	// Account API Tokens cannot read /memberships — fall back to /accounts only.
	// This preserves prior behavior where Account API Tokens see their single
	// associated account.
	if (
		membershipsRes.status === "rejected" &&
		isCode(membershipsRes.reason, INSUFFICIENT_PERMISSIONS_CODE)
	) {
		if (accountsRes.status === "fulfilled" && accountsRes.value.length > 0) {
			return accountsRes.value;
		}
		throw new UserError(
			`Failed to automatically retrieve account IDs for the logged in user.
You may have incorrect permissions on your API token. You can skip this account check by adding an \`account_id\` in your ${configFileName(undefined)} file, or by setting the value of CLOUDFLARE_ACCOUNT_ID"`,
			{ telemetryMessage: "user account fetch permission denied" }
		);
	}

	if (membershipsRes.status === "rejected") {
		// Permissive callers (e.g. `wrangler whoami`) treat /memberships as
		// best-effort: if it fails for any reason, fall back to /accounts so
		// the user can still see something useful.
		if (
			permissive &&
			accountsRes.status === "fulfilled" &&
			accountsRes.value.length > 0
		) {
			return accountsRes.value;
		}
		throw membershipsRes.reason;
	}
	if (accountsRes.status === "rejected") {
		// /accounts failed but /memberships succeeded — fall back to the membership
		// list so the user is not blocked when /accounts is temporarily unavailable
		// or restricted.
		const membershipAccounts = membershipsRes.value.map((m) => m.account);
		if (membershipAccounts.length === 0) {
			throw accountsRes.reason;
		}
		return membershipAccounts;
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
