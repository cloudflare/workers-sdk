import { join as pathJoin } from "node:path";
import { toUrlPath } from "../../paths";
import type { RouteConfig } from "./routes";

interface RoutesJSONSpec {
	version: 1;
	include: string[];
	exclude: string[];
}

type RoutesJSONRouteInput = Pick<RouteConfig, "routePath" | "middleware">[];

/**
 * TODO can we do better naming?
 */
export function convertRoutesToGlobPatterns(
	routes: RoutesJSONRouteInput
): string[] {
	const convertedRoutes = routes.map(({ routePath, middleware }) => {
		const globbedRoutePath: string = routePath.replace(/:\w+\*?.*/, "*");

		// Middleware mountings need to end in glob so that they can handle their
		// own sub-path routes
		if (
			typeof middleware === "string" ||
			(Array.isArray(middleware) && middleware.length > 0)
		) {
			if (!globbedRoutePath.endsWith("*")) {
				return toUrlPath(pathJoin(globbedRoutePath, "*"));
			}
		}

		return toUrlPath(globbedRoutePath);
	});

	return Array.from(new Set(convertedRoutes));
}

export function convertRoutesToRoutesJSONSpec(
	routes: RoutesJSONRouteInput
): RoutesJSONSpec {
	return {
		version: 1,
		include: convertRoutesToGlobPatterns(routes),
		exclude: [],
	};
}
