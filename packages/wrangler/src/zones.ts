import { configFileName, UserError } from "@cloudflare/workers-utils";
import { fetchListResult } from "./cfetch";
import { retryOnAPIFailure } from "./utils/retry";
import type { ComplianceConfig, Route } from "@cloudflare/workers-utils";

/**
 * An object holding information about a zone for publishing.
 */
export interface Zone {
	id: string;
	host: string;
}

/**
 * Get the hostname on which to run a Worker.
 *
 * The most accurate place is usually
 * `route.pattern`, as that includes any subdomains. For example:
 * ```js
 * {
 * 	pattern: foo.example.com
 * 	zone_name: example.com
 * }
 * ```
 * However, in the case of patterns that _can't_ be parsed as a hostname
 * (primarily the pattern `*/ /*`), we fall back to the `zone_name`
 * (and in the absence of that return undefined).
 * @param route
 */
export function getHostFromRoute(route: Route): string | undefined {
	let host: string | undefined;

	if (typeof route === "string") {
		host = getHostFromUrl(route);
	} else if (typeof route === "object") {
		host = getHostFromUrl(route.pattern);

		if (host === undefined && "zone_name" in route) {
			host = getHostFromUrl(route.zone_name);
		}
	}

	return host;
}

/**
 * Try to compute the a zone ID and host name for a route.
 *
 * When we're given a route, we do 2 things:
 * - We try to extract a host from it
 * - We try to get a zone id from the host
 */
export async function getZoneForRoute(
	complianceConfig: ComplianceConfig,
	from: {
		route: Route;
		accountId: string;
	},
	zoneIdCache: ZoneIdCache = new Map()
): Promise<Zone | undefined> {
	const { route, accountId } = from;
	const host = getHostFromRoute(route);
	let id: string | undefined;

	if (typeof route === "object" && "zone_id" in route) {
		id = route.zone_id;
	} else if (typeof route === "object" && "zone_name" in route) {
		id = await getZoneIdFromHost(
			complianceConfig,
			{
				host: route.zone_name,
				accountId,
			},
			zoneIdCache
		);
	} else if (host) {
		id = await getZoneIdFromHost(
			complianceConfig,
			{ host, accountId },
			zoneIdCache
		);
	}

	return id && host ? { id, host } : undefined;
}

/**
 * Given something that resembles a URL, try to extract a host from it.
 */
export function getHostFromUrl(urlLike: string): string | undefined {
	// if the urlLike-pattern uses a splat for the entire host and is only concerned with the pathname, we cannot infer a host
	if (
		urlLike.startsWith("*/") ||
		urlLike.startsWith("http://*/") ||
		urlLike.startsWith("https://*/")
	) {
		return undefined;
	}

	// if the urlLike-pattern uses a splat for the sub-domain (*.example.com) or for the root-domain (*example.com), remove the wildcard parts
	urlLike = urlLike.replace(/\*(\.)?/g, "");

	// prepend a protocol if the pattern did not specify one
	if (!(urlLike.startsWith("http://") || urlLike.startsWith("https://"))) {
		urlLike = "http://" + urlLike;
	}

	// now we've done our best to make urlLike a valid url string which we can pass to `new URL()` to get the host
	// if it still isn't, return undefined to indicate we couldn't infer a host
	try {
		return new URL(urlLike).host;
	} catch {
		return undefined;
	}
}
export async function getZoneIdForPreview(
	complianceConfig: ComplianceConfig,
	from: {
		host: string | undefined;
		routes: Route[] | undefined;
		accountId: string;
	}
) {
	const zoneIdCache: ZoneIdCache = new Map();
	const { host, routes, accountId } = from;
	let zoneId: string | undefined;
	if (host) {
		zoneId = await getZoneIdFromHost(
			complianceConfig,
			{ host, accountId },
			zoneIdCache
		);
	}
	if (!zoneId && routes) {
		const firstRoute = routes[0];
		const zone = await getZoneForRoute(
			complianceConfig,
			{
				route: firstRoute,
				accountId,
			},
			zoneIdCache
		);
		if (zone) {
			zoneId = zone.id;
		}
	}
	return zoneId;
}

/**
 * A mapping from account:host to zone id.
 */
export type ZoneIdCache = Map<string, Promise<string | null>>;

/**
 * Given something that resembles a host, try to infer a zone id from it.
 *
 * It's hard to get a 'valid' domain from a string, so we don't even try to validate TLDs, etc.
 * For each domain-like part of the host (e.g. w.x.y.z) try to get a zone id for it by
 * lopping off subdomains until we get a hit from the API.
 */
async function getZoneIdFromHost(
	complianceConfig: ComplianceConfig,
	from: {
		host: string;
		accountId: string;
	},
	zoneIdCache: ZoneIdCache
): Promise<string> {
	const hostPieces = from.host.split(".");

	while (hostPieces.length > 1) {
		const cacheKey = `${from.accountId}:${hostPieces.join(".")}`;
		if (!zoneIdCache.has(cacheKey)) {
			zoneIdCache.set(
				cacheKey,
				retryOnAPIFailure(() =>
					fetchListResult<{ id: string }>(
						complianceConfig,
						`/zones`,
						{},
						new URLSearchParams({
							name: hostPieces.join("."),
							"account.id": from.accountId,
						})
					)
				).then((zones) => zones[0]?.id ?? null)
			);
		}

		const cachedZone = await zoneIdCache.get(cacheKey);
		if (cachedZone) {
			return cachedZone;
		}

		hostPieces.shift();
	}

	throw new UserError(
		`Could not find zone for \`${from.host}\`. Make sure the domain is set up to be proxied by Cloudflare.\nFor more details, refer to https://developers.cloudflare.com/workers/configuration/routing/routes/#set-up-a-route`
	);
}

/**
 * An object holding information about an assigned worker route, returned from the API
 */
interface WorkerRoute {
	id: string;
	pattern: string;
	script: string;
}

/**
 * Given a zone within the user's account, return a list of all assigned worker routes
 */
async function getRoutesForZone(
	complianceConfig: ComplianceConfig,
	zone: string
): Promise<WorkerRoute[]> {
	const routes = await fetchListResult<WorkerRoute>(
		complianceConfig,
		`/zones/${zone}/workers/routes`
	);
	return routes;
}

/**
 * Given two strings, return the levenshtein distance between them as a simple text match heuristic
 */
function distanceBetween(a: string, b: string, cache = new Map()): number {
	if (cache.has(`${a}|${b}`)) {
		return cache.get(`${a}|${b}`);
	}
	let result;
	if (b == "") {
		result = a.length;
	} else if (a == "") {
		result = b.length;
	} else if (a[0] === b[0]) {
		result = distanceBetween(a.slice(1), b.slice(1), cache);
	} else {
		result =
			1 +
			Math.min(
				distanceBetween(a.slice(1), b, cache),
				distanceBetween(a, b.slice(1), cache),
				distanceBetween(a.slice(1), b.slice(1), cache)
			);
	}
	cache.set(`${a}|${b}`, result);
	return result;
}

/**
 * Given an invalid route, sort the valid routes by closeness to the invalid route (levenstein distance)
 */
function findClosestRoute(
	providedRoute: string,
	assignedRoutes: WorkerRoute[]
): WorkerRoute[] {
	return assignedRoutes.sort((a, b) => {
		const distanceA = distanceBetween(providedRoute, a.pattern);
		const distanceB = distanceBetween(providedRoute, b.pattern);
		return distanceA - distanceB;
	});
}

/**
 * Given a route (must be assigned and within the correct zone), return the name of the worker assigned to it
 */
export async function getWorkerForZone(
	complianceConfig: ComplianceConfig,
	from: {
		worker: string;
		accountId: string;
	},
	configPath: string | undefined
) {
	const { worker, accountId } = from;
	const zone = await getZoneForRoute(complianceConfig, {
		route: worker,
		accountId,
	});
	if (!zone) {
		throw new UserError(
			`The route '${worker}' is not part of one of your zones. Either add this zone from the Cloudflare dashboard, or try using a route within one of your existing zones.`
		);
	}
	const routes = await getRoutesForZone(complianceConfig, zone.id);

	const scriptName = routes.find((route) => route.pattern === worker)?.script;

	if (!scriptName) {
		const closestRoute = findClosestRoute(worker, routes)?.[0];

		if (!closestRoute) {
			throw new UserError(
				`The route '${worker}' has no workers assigned. You can assign a worker to it from your ${configFileName(configPath)} file or the Cloudflare dashboard`
			);
		} else {
			throw new UserError(
				`The route '${worker}' has no workers assigned. Did you mean to tail the route '${closestRoute.pattern}'?`
			);
		}
	}

	return scriptName;
}
