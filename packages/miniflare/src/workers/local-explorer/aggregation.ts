/**
 * Utilities for cross-instance aggregation in the local explorer.
 *
 * When multiple Miniflare instances run with a shared dev registry,
 * the explorer API can aggregate data from all instances.
 */

import { LOCAL_EXPLORER_API_PATH } from "../../plugins/core/constants";
import type { WorkerRegistry } from "../../shared/dev-registry";

/**
 * Header that indicates a request should not trigger further aggregation.
 * Used to prevent infinite recursion when instance A fetches from instance B.
 */
export const NO_AGGREGATE_HEADER = "X-Miniflare-Explorer-No-Aggregate";

/**
 * Check if the current request should trigger cross-instance aggregation.
 * Returns false if the no-aggregate header is present (indicating this is
 * already a peer-to-peer request).
 */
export function shouldAggregate(request: Request): boolean {
	return !request.headers.has(NO_AGGREGATE_HEADER);
}

/**
 * Fetch the current dev registry from the loopback service.
 * Returns an empty registry if the fetch fails.
 */
export async function fetchRegistry(
	loopback: Fetcher
): Promise<WorkerRegistry> {
	try {
		const response = await loopback.fetch("http://localhost/core/dev-registry");
		if (!response.ok) {
			return {};
		}
		return (await response.json()) as WorkerRegistry;
	} catch {
		return {};
	}
}

/**
 * Get the base URLs of peer instances from the registry,
 * excluding the current instance (identified by worker names).
 */
export function getPeerUrls(
	registry: WorkerRegistry,
	selfWorkerNames: string[]
): string[] {
	const selfSet = new Set(selfWorkerNames);
	return Object.entries(registry)
		.filter(([name]) => !selfSet.has(name))
		.map(([, def]) => `${def.protocol}://${def.host}:${def.port}`);
}

/**
 * Fetch data from a peer instance's explorer API.
 * Returns null on any error (silent omission policy).
 *
 * @param peerUrl - Base URL of the peer instance (e.g., "http://127.0.0.1:8788")
 * @param apiPath - API path relative to the explorer API base (e.g., "/d1/database")
 * @param init - Optional fetch init options
 */
export async function fetchFromPeer(
	peerUrl: string,
	apiPath: string,
	init?: RequestInit
): Promise<Response | null> {
	try {
		const url = new URL(`${LOCAL_EXPLORER_API_PATH}${apiPath}`, peerUrl);
		const response = await fetch(url.toString(), {
			...init,
			headers: {
				...(init?.headers as Record<string, string> | undefined),
				[NO_AGGREGATE_HEADER]: "true",
				Host: "localhost",
			},
		});
		return response;
	} catch {
		return null;
	}
}

/**
 * Aggregate list results from local data and peer instances.
 *
 * @param localResults - Results from the local instance
 * @param peerUrls - Base URLs of peer instances
 * @param apiPath - API path relative to the explorer API base
 */
export async function aggregateListResults<T>(
	localResults: T[],
	peerUrls: string[],
	apiPath: string
): Promise<T[]> {
	const peerResponses = await Promise.all(
		peerUrls.map((url) => fetchFromPeer(url, apiPath))
	);

	const allResults = [...localResults];

	for (const response of peerResponses) {
		if (response?.ok) {
			try {
				const data = (await response.json()) as { result: T[] };
				if (Array.isArray(data.result)) {
					allResults.push(...data.result);
				}
			} catch {
				// Skip malformed responses
			}
		}
	}

	return allResults;
}

/**
 * Proxy a request to peer instances until one returns a successful response.
 * Used for detail/mutation endpoints where the resource exists on exactly one instance.
 *
 * @param peerUrls - Base URLs of peer instances
 * @param apiPath - API path relative to the explorer API base
 * @param init - Optional fetch init options
 * @returns The first successful response, or null if all peers fail/return 404
 */
export async function proxyToFirstAvailablePeer(
	peerUrls: string[],
	apiPath: string,
	init?: RequestInit
): Promise<Response | null> {
	for (const url of peerUrls) {
		const response = await fetchFromPeer(url, apiPath, init);
		if (response !== null && response.status !== 404) {
			// Return any non-404 response (success or validation error)
			return response;
		}
	}
	return null;
}

/**
 * Helper type for aggregation context passed to handlers.
 */
export interface AggregationContext {
	shouldAggregate: boolean;
	loopback: Fetcher | undefined;
	workerNames: string[] | undefined;
}

/**
 * Build aggregation context from environment and request.
 */
export function getAggregationContext(
	request: Request,
	loopback: Fetcher | undefined,
	workerNames: string[] | undefined
): AggregationContext {
	return {
		shouldAggregate:
			shouldAggregate(request) &&
			loopback !== undefined &&
			workerNames !== undefined &&
			workerNames.length > 0,
		loopback,
		workerNames,
	};
}

/**
 * Get peer URLs if aggregation is enabled, otherwise return empty array.
 */
export async function getPeerUrlsIfAggregating(
	ctx: AggregationContext
): Promise<string[]> {
	if (!ctx.shouldAggregate || !ctx.loopback || !ctx.workerNames?.length) {
		return [];
	}
	const registry = await fetchRegistry(ctx.loopback);
	return getPeerUrls(registry, ctx.workerNames);
}
