import { UserError } from "@cloudflare/workers-utils";

const ACCOUNT_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

export function ensureValidAccountId(accountId: string, source: string): string {
	if (!ACCOUNT_ID_PATTERN.test(accountId)) {
		throw new UserError(
			`The account ID from ${source} contains invalid characters. Account IDs may only contain letters, numbers, hyphens, and underscores.`
		);
	}

	return accountId;
}
