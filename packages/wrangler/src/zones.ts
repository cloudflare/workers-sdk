import { fetchListResult } from "./cfetch";
import type { Route } from "./config/environment";

/**
 * An object holding information about a zone for publishing.
 */
export interface RouteZoneAndHost {
  zone: string;
  host: string;
}

/**
 * Try to compute the a zone ID and host name for one or more routes.
 *
 * When we're given a route, we do 2 things:
 * - We try to extract a host from it
 * - We try to get a zone id from the host
 */
export async function* getZonesAndHostsForRoutes(
  routes: Route | Route[]
): AsyncGenerator<RouteZoneAndHost> {
  if (!Array.isArray(routes)) {
    routes = [routes];
  }

  for (const route of routes) {
    let zone: string | undefined =
      typeof route === "object" && "zone_id" in route
        ? route.zone_id
        : undefined;

    const host =
      typeof route === "string"
        ? getHost(route)
        : typeof route === "object"
        ? "zone_name" in route
          ? getHost(route.zone_name)
          : getHost(route.pattern)
        : undefined;

    if (host && !zone) {
      zone = await getZoneFromHost(host);
    }

    if (zone && host) {
      yield {
        host,
        zone,
      };
    }
  }
}

/**
 * Given something that resembles a URL, try to extract a host from it.
 */
function getHost(urlLike: string): string | undefined {
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
export async function getZoneFromHost(host: string): Promise<string> {
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
