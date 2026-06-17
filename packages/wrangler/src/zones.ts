import { getZoneForRoute, getZoneIdFromHost } from "@cloudflare/deploy-helpers";
import { configFileName, UserError } from "@cloudflare/workers-utils";
import { fetchListResult } from "./cfetch";
import type { ZoneIdCache } from "@cloudflare/deploy-helpers";
import type { ComplianceConfig, Route } from "@cloudflare/workers-utils";

export {
	getHostFromRoute,
	getHostFromUrl,
	getZoneFromRoute,
} from "@cloudflare/workers-utils";

export async function getZoneIdForPreview(
	complianceConfig: ComplianceConfig,
	from: {
		host: string | undefined;
		routes: Route[] | undefined;
		accountId: string;
	}
) {
	const zoneIdCache: ZoneIdCache = new Map();
	const { host, routes, accountId } = from;
	let zoneId: string | undefined;
	if (host) {
		zoneId = await getZoneIdFromHost(
			complianceConfig,
			{ host, accountId },
			zoneIdCache
		);
	}
	if (!zoneId && routes) {
		const firstRoute = routes[0];
		const zone = await getZoneForRoute(
			complianceConfig,
			{
				route: firstRoute,
				accountId,
			},
			zoneIdCache
		);
		if (zone) {
			zoneId = zone.id;
		}
	}
	return zoneId;
}

/**
 * An object holding information about an assigned worker route, returned from the API
 */
interface WorkerRoute {
	id: string;
	pattern: string;
	script: string;
}

/**
 * Given a zone within the user's account, return a list of all assigned worker routes
 */
async function getRoutesForZone(
	complianceConfig: ComplianceConfig,
	zone: string
): Promise<WorkerRoute[]> {
	const routes = await fetchListResult<WorkerRoute>(
		complianceConfig,
		`/zones/${zone}/workers/routes`
	);
	return routes;
}

/**
 * Given two strings, return the levenshtein distance between them as a simple text match heuristic
 */
function distanceBetween(a: string, b: string, cache = new Map()): number {
	if (cache.has(`${a}|${b}`)) {
		return cache.get(`${a}|${b}`);
	}
	let result;
	if (b == "") {
		result = a.length;
	} else if (a == "") {
		result = b.length;
	} else if (a[0] === b[0]) {
		result = distanceBetween(a.slice(1), b.slice(1), cache);
	} else {
		result =
			1 +
			Math.min(
				distanceBetween(a.slice(1), b, cache),
				distanceBetween(a, b.slice(1), cache),
				distanceBetween(a.slice(1), b.slice(1), cache)
			);
	}
	cache.set(`${a}|${b}`, result);
	return result;
}

/**
 * Given an invalid route, sort the valid routes by closeness to the invalid route (levenstein distance)
 */
function findClosestRoute(
	providedRoute: string,
	assignedRoutes: WorkerRoute[]
): WorkerRoute[] {
	return assignedRoutes.sort((a, b) => {
		const distanceA = distanceBetween(providedRoute, a.pattern);
		const distanceB = distanceBetween(providedRoute, b.pattern);
		return distanceA - distanceB;
	});
}

/**
 * Given a route (must be assigned and within the correct zone), return the name of the worker assigned to it
 */
export async function getWorkerForZone(
	complianceConfig: ComplianceConfig,
	from: {
		worker: string;
		accountId: string;
	},
	configPath: string | undefined
) {
	const { worker, accountId } = from;
	const zone = await getZoneForRoute(complianceConfig, {
		route: worker,
		accountId,
	});
	if (!zone) {
		throw new UserError(
			`The route '${worker}' is not part of one of your zones. Either add this zone from the Cloudflare dashboard, or try using a route within one of your existing zones.`,
			{ telemetryMessage: "zones route outside account zones" }
		);
	}
	const routes = await getRoutesForZone(complianceConfig, zone.id);

	const scriptName = routes.find((route) => route.pattern === worker)?.script;

	if (!scriptName) {
		const closestRoute = findClosestRoute(worker, routes)?.[0];

		if (!closestRoute) {
			throw new UserError(
				`The route '${worker}' has no workers assigned. You can assign a worker to it from your ${configFileName(configPath)} file or the Cloudflare dashboard`,
				{ telemetryMessage: "zones route missing worker assignment" }
			);
		} else {
			throw new UserError(
				`The route '${worker}' has no workers assigned. Did you mean to tail the route '${closestRoute.pattern}'?`,
				{ telemetryMessage: "zones route suggested worker assignment" }
			);
		}
	}

	return scriptName;
}
