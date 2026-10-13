import { UserError } from "@cloudflare/workers-utils";
import { fetchPagedListResult, fetchResult } from "../../../cfetch";
import type { ConcurrencyKey } from "../../types";
import type { Config } from "@cloudflare/workers-utils";

export const concurrencyKeyMetadata = {
	owner: "Product: Workflows",
	status: "open beta",
} as const;

export const concurrencyKeyArg = {
	describe: "Name or ID of the concurrency key",
	type: "string",
	demandOption: true,
} as const;

const KEY_ID =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function concurrencyKeysPath(accountId: string, keyId?: string): string {
	const base = `/accounts/${accountId}/workflows/concurrency`;
	return keyId === undefined ? base : `${base}/${encodeURIComponent(keyId)}`;
}

/** Steps reference keys by name, but the API addresses them by ID, so accept either.
 * A UUID-shaped argument is always an ID; anything else is looked up by exact name. */
export async function resolveConcurrencyKeyId(
	config: Config,
	accountId: string,
	nameOrId: string
): Promise<string> {
	if (KEY_ID.test(nameOrId)) {
		return nameOrId;
	}
	const keys = await fetchPagedListResult<ConcurrencyKey>(
		config,
		concurrencyKeysPath(accountId),
		{},
		new URLSearchParams({ per_page: "100" })
	);
	const key = keys.find((candidate) => candidate.name === nameOrId);
	if (key === undefined) {
		throw new UserError(
			`No concurrency key named "${nameOrId}" in this account. Run \`wrangler workflows concurrency list\` to see the keys.`,
			{ telemetryMessage: "workflows concurrency key not found by name" }
		);
	}
	return key.id;
}

export async function getConcurrencyKey<T extends ConcurrencyKey>(
	config: Config,
	accountId: string,
	keyId: string
): Promise<T> {
	return fetchResult<T>(config, concurrencyKeysPath(accountId, keyId));
}
