import type { Route } from "./config/environment";

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
 * Best-effort derivation of the Cloudflare zone name that owns a given route,
 * for use as the `CF-Worker` header value on outbound subrequests in local
 * development (see https://developers.cloudflare.com/fundamentals/reference/http-headers/#cf-worker).
 *
 * In production, `CF-Worker` is set to the zone name — for a route
 * `foo.example.com/*` on zone `example.com`, the header is `example.com`.
 * When the user has explicitly told us the zone name in their route config
 * (`zone_name`), use it. Otherwise, fall back to {@link getHostFromRoute},
 * which returns the route pattern's hostname — this is the closest local
 * approximation without performing an API lookup, and matches the behaviour
 * users see when their route's hostname is already the apex (e.g.
 * `example.com/*`).
 */
export function getZoneFromRoute(route: Route): string | undefined {
	if (typeof route === "object" && "zone_name" in route && route.zone_name) {
		return route.zone_name;
	}
	return getHostFromRoute(route);
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
