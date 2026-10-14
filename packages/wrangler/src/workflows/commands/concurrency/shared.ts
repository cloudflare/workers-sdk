import { UserError } from "@cloudflare/workers-utils";
import { fetchPagedListResult, fetchResult } from "../../../cfetch";
import { requireAuth } from "../../../user";
import { fetchLocalResult, localWorkflowArgs } from "../../local";
import type { ConcurrencyKey, ConcurrencyKeyDetail } from "../../types";
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

export const concurrencyLocalArgs = {
	...localWorkflowArgs,
	local: {
		...localWorkflowArgs.local,
		describe:
			"Manage the concurrency keys of a local dev session instead of the account",
	},
};

const KEY_ID =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ConcurrencyKeysClient {
	readonly local: boolean;
	list(page: number, perPage?: number): Promise<ConcurrencyKey[]>;
	resolveId(nameOrId: string): Promise<string>;
	get(keyId: string): Promise<ConcurrencyKeyDetail>;
	create(name: string, limit: number): Promise<ConcurrencyKey>;
	update(keyId: string, limit: number): Promise<ConcurrencyKey>;
	delete(keyId: string): Promise<void>;
}

export function concurrencyKeysPath(accountId: string, keyId?: string): string {
	const base = `/accounts/${accountId}/workflows/concurrency`;
	return keyId === undefined ? base : `${base}/${encodeURIComponent(keyId)}`;
}

function jsonBody(method: string, body: unknown) {
	return {
		method,
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	};
}

export async function getConcurrencyKeysClient(
	config: Config,
	args: { local?: boolean; port: number }
): Promise<ConcurrencyKeysClient> {
	if (args.local) {
		return localConcurrencyKeysClient(args.port);
	}
	return remoteConcurrencyKeysClient(config, await requireAuth(config));
}

function remoteConcurrencyKeysClient(
	config: Config,
	accountId: string
): ConcurrencyKeysClient {
	return {
		local: false,
		async list(page, perPage) {
			const params = new URLSearchParams({ page: String(page) });
			if (perPage !== undefined) {
				params.set("per_page", String(perPage));
			}
			return fetchResult<ConcurrencyKey[]>(
				config,
				concurrencyKeysPath(accountId),
				undefined,
				params
			);
		},
		// Steps reference keys by name, but the API addresses them by ID, so accept either.
		// A UUID-shaped argument is always an ID; anything else is looked up by exact name.
		async resolveId(nameOrId) {
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
		},
		get: (keyId) =>
			fetchResult<ConcurrencyKeyDetail>(
				config,
				concurrencyKeysPath(accountId, keyId)
			),
		create: (name, limit) =>
			fetchResult<ConcurrencyKey>(
				config,
				concurrencyKeysPath(accountId),
				jsonBody("POST", { name, limit })
			),
		update: (keyId, limit) =>
			fetchResult<ConcurrencyKey>(
				config,
				concurrencyKeysPath(accountId, keyId),
				jsonBody("PATCH", { limit })
			),
		async delete(keyId) {
			await fetchResult(config, concurrencyKeysPath(accountId, keyId), {
				method: "DELETE",
			});
		},
	};
}

// The Local Explorer accepts a key's name wherever the API takes its ID, so a local
// lookup needs no extra list request.
function localConcurrencyKeysClient(port: number): ConcurrencyKeysClient {
	const path = (keyId?: string) =>
		keyId === undefined
			? "/workflows/concurrency"
			: `/workflows/concurrency/${encodeURIComponent(keyId)}`;
	return {
		local: true,
		list(page, perPage) {
			const params = new URLSearchParams({ page: String(page) });
			if (perPage !== undefined) {
				params.set("per_page", String(perPage));
			}
			return fetchLocalResult<ConcurrencyKey[]>(port, `${path()}?${params}`);
		},
		async resolveId(nameOrId) {
			return nameOrId;
		},
		get: (keyId) => fetchLocalResult<ConcurrencyKeyDetail>(port, path(keyId)),
		create: (name, limit) =>
			fetchLocalResult<ConcurrencyKey>(
				port,
				path(),
				jsonBody("POST", { name, limit })
			),
		update: (keyId, limit) =>
			fetchLocalResult<ConcurrencyKey>(
				port,
				path(keyId),
				jsonBody("PATCH", { limit })
			),
		async delete(keyId) {
			await fetchLocalResult(port, path(keyId), { method: "DELETE" });
		},
	};
}

export function formatUsage(key: ConcurrencyKey): string | undefined {
	if (key.usage === undefined) {
		return undefined;
	}
	return `${key.usage.holding} / ${key.limit} held, ${key.usage.waiting} waiting`;
}
