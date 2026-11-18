import type { CustomDomainRoute, Route } from "@cloudflare/workers-utils";

/**
 * Splits Worker routes into the categories handled by the routes and custom
 * domains APIs.
 *
 * @param routes - The routes to partition
 * @returns The routes grouped by the API that manages them
 */
export function partitionRoutes(routes: Route[]): {
	routesOnly: Route[];
	customDomainsOnly: CustomDomainRoute[];
} {
	const routesOnly: Route[] = [];
	const customDomainsOnly: CustomDomainRoute[] = [];

	for (const route of routes) {
		if (isCustomDomainRoute(route)) {
			customDomainsOnly.push(route);
		} else {
			routesOnly.push(route);
		}
	}

	return { routesOnly, customDomainsOnly };
}

function isCustomDomainRoute(route: Route): route is CustomDomainRoute {
	return typeof route !== "string" && route.custom_domain === true;
}
