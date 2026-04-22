/**
 * Utilities for cross-instance aggregation in the local explorer.
 *
 * When multiple Miniflare instances run with a shared dev registry,
 * any one instance can aggregate data from all instances.
 */

import { env } from "cloudflare:workers";
import { CorePaths } from "../core";
import type { WorkerRegistry } from "../../shared/dev-registry-types";
import type { AppContext } from "./common";

const EXPLORER_API_PATH = `${CorePaths.EXPLORER}/api`;

/**
 * Header that indicates a request should not trigger further aggregation.
 * Used to prevent infinite recursion when instance A fetches from instance B.
 */
export const NO_AGGREGATE_HEADER = "X-Miniflare-Explorer-No-Aggregate";

/**
 * Get the unique base URLs of peer instances from the dev registry,
 * excluding the current instance (identified by worker names).
 */
function getPeerDebugPortAddresses(
	registry: WorkerRegistry,
	selfWorkerNames: string[]
): string[] {
	const selfSet = new Set(selfWorkerNames);
	const addresses = Object.entries(registry)
		.filter(([name]) => !selfSet.has(name))
		.map(([, def]) => def.debugPortAddress)
		.filter((addr): addr is string => typeof addr === "string");
	// A single Miniflare process with multiple workers registers multiple
	// entries in the registry, all sharing the same host:port. We deduplicate
	// to avoid fetching from the same peer multiple times.
	return [...new Set(addresses)];
}

export async function getPeerUrlsIfAggregating(
	c: AppContext
): Promise<string[]> {
	if (c.req.raw.headers.has(NO_AGGREGATE_HEADER)) {
		return [];
	}
	const loopback = c.env.MINIFLARE_LOOPBACK;
	const workerNames = c.env.LOCAL_EXPLORER_WORKER_NAMES;
	const response = await loopback.fetch("http://localhost/core/dev-registry");
	const registry = (await response.json()) as WorkerRegistry;
	return getPeerDebugPortAddresses(registry, workerNames);
}

/**
 * Fetch data from a peer instance's explorer API.
 * Returns null on any error (silent omission policy).
 *
 * @param peerDebugPortAddress - Debug port address of the peer instance (e.g., "127.0.0.1:12345")
 * @param apiPath - API path relative to the explorer API base (e.g., "/d1/database")
 * @param init - Optional fetch init options
 */
export async function fetchFromPeer(
	peerDebugPortAddress: string,
	apiPath: string,
	init?: RequestInit
): Promise<Response | null> {
	try {
		const client = (env as AppContext["env"]).DEV_REGISTRY_DEBUG_PORT.connect(
			peerDebugPortAddress
		);
		const fetcher = client.getEntrypoint("core:entry");
		const url = new URL(`http://localhost${EXPLORER_API_PATH}${apiPath}`);
		const response = await fetcher.fetch(url.toString(), {
			...init,
			headers: {
				...(init?.headers as Record<string, string> | undefined),
				[NO_AGGREGATE_HEADER]: "true",
				Host: "localhost",
			},
		});
		return new Response(response.body, response);
	} catch {
		return null;
	}
}

/**
 * Aggregate list results from local data and peer instances.
 *
 * @param c - Hono app context
 * @param localResults - Results from the local instance
 * @param apiPath - API path relative to the explorer API base
 * @param resultKey - horrible special case because r2 bucket list nests its results
 */
export async function aggregateListResults<T>(
	c: AppContext,
	localResults: T[],
	apiPath: string,
	resultKey?: string
): Promise<T[]> {
	const peerUrls = await getPeerUrlsIfAggregating(c);
	if (peerUrls.length === 0) {
		return localResults;
	}

	const peerResults = await Promise.all(
		peerUrls.map(async (url) => {
			const response = await fetchFromPeer(url, apiPath);
			if (!response?.ok) return [];
			try {
				const data = (await response.json()) as {
					result: T[] | { [key: string]: T[] };
				};
				if (Array.isArray(data.result)) {
					return data.result;
				}
				if (resultKey) {
					return data.result[resultKey] ?? [];
				}
				throw new Error("unreachable");
			} catch {
				return [];
			}
		})
	);

	return [...localResults, ...peerResults.flat()];
}
