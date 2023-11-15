export interface WorkerRoute {
	target: string;
	route: string;
	specificity: number;

	protocol?: string;
	allowHostnamePrefix: boolean;
	hostname: string;
	path: string;
	allowPathSuffix: boolean;
}

export function matchRoutes(routes: WorkerRoute[], url: URL): string | null {
	for (const route of routes) {
		if (route.protocol && route.protocol !== url.protocol) continue;

		if (route.allowHostnamePrefix) {
			if (!url.hostname.endsWith(route.hostname)) continue;
		} else {
			if (url.hostname !== route.hostname) continue;
		}

		const path = url.pathname + url.search;
		if (route.allowPathSuffix) {
			if (!path.startsWith(route.path)) continue;
		} else {
			if (path !== route.path) continue;
		}

		return route.target;
	}

	return null;
}
