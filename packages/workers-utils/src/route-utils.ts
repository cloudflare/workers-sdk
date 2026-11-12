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
 * Gets the zone of a `cloudflare.config.ts` Worker's first route, as Wrangler
 * configs get it. This is the zone that Miniflare's `dev.zone` puts in the
 * `CF-Worker` header of the Worker's outgoing requests.
 *
 * @param config The Worker's domains and triggers.
 * @returns The zone, if the Worker has a route.
 */
export function getWorkerZone(config: {
	domains?: readonly (string | { hostname: string })[];
	triggers?: readonly { type: string; pattern?: string; zone?: string }[];
}): string | undefined {
	// Domains are converted to routes before fetch triggers, so this mirrors the
	// first-route selection used by Wrangler's Miniflare options.
	const domain = config.domains?.[0];
	if (domain !== undefined) {
		return getZoneFromRoute(
			typeof domain === "string" ? domain : domain.hostname
		);
	}

	const fetchTrigger = config.triggers?.find(
		(trigger) => trigger.type === "fetch"
	);
	if (fetchTrigger?.pattern === undefined) {
		return undefined;
	}

	return getZoneFromRoute(
		fetchTrigger.zone?.includes(".")
			? { pattern: fetchTrigger.pattern, zone_name: fetchTrigger.zone }
			: fetchTrigger.pattern
	);
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
