/**
 * consolidateRoutes consolidates redundant routes - eg. ["/api/*"", "/api/foo"] -> ["/api/*""]
 * @param routes If this is the same order as Functions routes (with most-specific first),
 *   it will be more efficient to reverse it first. Should be in the format: /api/foo, /api/*
 * @returns Non-redundant list of routes
 */
export function consolidateRoutes(routes: string[]): string[] {
	// create a map of the routes
	const routesMap = new Map<string, boolean>();
	for (const route of routes) {
		routesMap.set(route, true);
	}
	// Find routes that might render other routes redundant
	for (const route of routes.filter((r) => r.endsWith("/*"))) {
		// Make sure the route still exists in the map
		if (routesMap.has(route)) {
			// Remove splat at the end, leaving the /
			// eg. /api/* -> /api/
			const routeTrimmed = route.substring(0, route.length - 1);
			for (const nextRoute of routesMap.keys()) {
				// Delete any route that has the wildcard route as a prefix
				if (nextRoute !== route && nextRoute.startsWith(routeTrimmed)) {
					routesMap.delete(nextRoute);
				}
			}
		}
	}
	return Array.from(routesMap.keys());
}
