import { domainToUnicode, URL } from "node:url";
import { MiniflareError } from "../../shared";
import { WorkerRoute } from "../../workers";

export type RouterErrorCode = "ERR_QUERY_STRING" | "ERR_INFIX_WILDCARD";

export class RouterError extends MiniflareError<RouterErrorCode> {}

function routeSpecificity(url: URL) {
	// Adapted from internal config service routing table implementation
	const hostParts = url.host.split(".");
	let hostScore = hostParts.length;
	if (hostParts[0] === "*") hostScore -= 2;

	const pathParts = url.pathname.split("/");
	let pathScore = pathParts.length;
	if (pathParts[pathParts.length - 1] === "*") pathScore -= 2;

	return hostScore * 26 + pathScore;
}

export function parseRoutes(allRoutes: Map<string, string[]>): WorkerRoute[] {
	const routes: WorkerRoute[] = [];
	for (const [target, targetRoutes] of allRoutes) {
		for (const route of targetRoutes) {
			const hasProtocol = /^[a-z0-9+\-.]+:\/\//i.test(route);

			let urlInput = route;
			// If route is missing a protocol, give it one so it parses
			if (!hasProtocol) urlInput = `https://${urlInput}`;
			const url = new URL(urlInput);
			const specificity = routeSpecificity(url);

			const protocol = hasProtocol ? url.protocol : undefined;

			const internationalisedAllowHostnamePrefix =
				url.hostname.startsWith("xn--*");
			const allowHostnamePrefix =
				url.hostname.startsWith("*") || internationalisedAllowHostnamePrefix;
			const anyHostname = url.hostname === "*";
			if (allowHostnamePrefix && !anyHostname) {
				let hostname = url.hostname;
				// If hostname is internationalised (e.g. `xn--gld-tna.se`), decode it
				if (internationalisedAllowHostnamePrefix) {
					hostname = domainToUnicode(hostname);
				}
				// Remove leading "*"
				url.hostname = hostname.substring(1);
			}

			const allowPathSuffix = url.pathname.endsWith("*");
			if (allowPathSuffix) {
				url.pathname = url.pathname.substring(0, url.pathname.length - 1);
			}

			if (url.search) {
				throw new RouterError(
					"ERR_QUERY_STRING",
					`Route "${route}" for "${target}" contains a query string. This is not allowed.`
				);
			}
			if (url.toString().includes("*") && !anyHostname) {
				throw new RouterError(
					"ERR_INFIX_WILDCARD",
					`Route "${route}" for "${target}" contains an infix wildcard. This is not allowed.`
				);
			}

			routes.push({
				target,
				route,
				specificity,

				protocol,
				allowHostnamePrefix,
				hostname: anyHostname ? "" : url.hostname,
				path: url.pathname,
				allowPathSuffix,
			});
		}
	}

	// Sort with the highest specificity first
	routes.sort((a, b) => {
		if (a.specificity === b.specificity) {
			// If routes are equally specific, sort by longest route first
			return b.route.length - a.route.length;
		} else {
			return b.specificity - a.specificity;
		}
	});

	return routes;
}
