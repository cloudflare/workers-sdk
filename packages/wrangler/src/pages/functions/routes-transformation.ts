/**
 * TODO can we do better naming?
 */
export function convertRoutePathsToGlobPatterns(routes: string[]): string[] {
	const convertedRoutes = routes.map((route) => route.replace(/:\w+\*?.*/, "*"));

	return Array.from(new Set(convertedRoutes));
}