import { fetchListResult } from "./cfetch";
import type { Route } from "./config/environment";

/**
 * An object holding information about a zone for publishing.
 */
export interface Zone {
	id: string;
	host: string;
}

export function getHostFromRoute(route: Route): string | undefined {
	return typeof route === "string"
		? getHostFromUrl(route)
		: typeof route === "object"
		? "zone_name" in route
			? getHostFromUrl(route.zone_name)
			: getHostFromUrl(route.pattern)
		: undefined;
}

/**
 * Try to compute the a zone ID and host name for one or more routes.
 *
 * When we're given a route, we do 2 things:
 * - We try to extract a host from it
 * - We try to get a zone id from the host
 */
export async function getZoneForRoute(route: Route): Promise<Zone | undefined> {
	const host = getHostFromRoute(route);
	const id =
		typeof route === "object" && "zone_id" in route
			? route.zone_id
			: host
			? await getZoneIdFromHost(host)
			: undefined;
	return id && host ? { id, host } : undefined;
}

/**
 * Given something that resembles a URL, try to extract a host from it.
 */
function getHostFromUrl(urlLike: string): string | undefined {
	// strip leading * / *.
	urlLike = urlLike.replace(/^\*(\.)?/g, "");

	if (!(urlLike.startsWith("http://") || urlLike.startsWith("https://"))) {
		urlLike = "http://" + urlLike;
	}
	return new URL(urlLike).host;
}

/**
 * Given something that resembles a host, try to infer a zone id from it.
 *
 * It's hard to get a 'valid' domain from a string, so we don't even try to validate TLDs, etc.
 * For each domain-like part of the host (e.g. w.x.y.z) try to get a zone id for it by
 * lopping off subdomains until we get a hit from the API.
 */
export async function getZoneIdFromHost(host: string): Promise<string> {
	const hostPieces = host.split(".");

	while (hostPieces.length > 1) {
		const zones = await fetchListResult<{ id: string }>(
			`/zones`,
			{},
			new URLSearchParams({ name: hostPieces.join(".") })
		);
		if (zones.length > 0) {
			return zones[0].id;
		}
		hostPieces.shift();
	}

	throw new Error(`Could not find zone for ${host}`);
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
export async function getRoutesForZone(zone: string): Promise<WorkerRoute[]> {
	const routes = await fetchListResult<WorkerRoute>(
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
export function findClosestRoute(
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
export async function getWorkerForZone(worker: string) {
	const zone = await getZoneForRoute(worker);
	if (!zone) {
		throw new Error(
			`The route '${worker}' is not part of one of your zones. Either add this zone from the Cloudflare dashboard, or try using a route within one of your existing zones.`
		);
	}
	const routes = await getRoutesForZone(zone.id);

	const scriptName = routes.find((route) => route.pattern === worker)?.script;

	if (!scriptName) {
		const closestRoute = findClosestRoute(worker, routes)?.[0];

		if (!closestRoute) {
			throw new Error(
				`The route '${worker}' has no workers assigned. You can assign a worker to it from wrangler.toml or the Cloudflare dashboard`
			);
		} else {
			throw new Error(
				`The route '${worker}' has no workers assigned. Did you mean to tail the route '${closestRoute.pattern}'?`
			);
		}
	}

	return scriptName;
}
