import { UserError } from "@cloudflare/workers-utils";

// Deliberately looser than the 32-character hex IDs the API hands out: the goal
// is to reject values that cannot travel in a request at all, not to second-guess
// what the API will accept.
const ACCOUNT_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

/**
 * Validate a user-supplied account ID before it reaches the API layer.
 *
 * Account IDs are substituted straight into Cloudflare API URL paths, and
 * `fetch()` rejects URL/header values that aren't representable as a
 * `ByteString`. Without this check, an account ID containing non-ASCII
 * characters fails deep inside the request layer with an opaque
 * `Cannot convert argument to a ByteString` error that gives no hint about
 * which setting is at fault.
 *
 * @param accountId The account ID to check.
 * @param source Where the value came from, phrased to read after the ID —
 * e.g. `"set in the \`CLOUDFLARE_ACCOUNT_ID\` environment variable"`.
 * @returns The account ID, so this can be used inline.
 */
export function validateAccountId(accountId: string, source: string): string {
	if (!ACCOUNT_ID_PATTERN.test(accountId)) {
		throw new UserError(
			`Invalid account ID "${accountId}" ${source}. Account IDs may only contain alphanumeric characters, hyphens, and underscores.`,
			{ telemetryMessage: "user account id invalid characters" }
		);
	}

	return accountId;
}
