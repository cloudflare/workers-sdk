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
