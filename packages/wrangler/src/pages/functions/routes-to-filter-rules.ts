import type { UrlPath } from "../../paths";

export const WorkerRouterVersion = 1;

export type WorkerRouter = {
	version: 1;
	include: string[];
	exclude: string[];
};

export function convertRouteNamesToAsterisks(input: string[]): string[] {
	return input.map((rule) => rule.replace(/:\w+\*?/g, "*"));
}

export function convertRouteListToFilterRules(routes: UrlPath[]): WorkerRouter {
	const uniqueRoutes = Array.from(new Set(routes));

	return {
		version: WorkerRouterVersion,
		include: convertRouteNamesToAsterisks(uniqueRoutes),
		exclude: [],
	};
}
