import { CommandLineArgsError } from "@cloudflare/workers-utils";
import type { NamedArgDefinitions } from "../core/types";
import type { Route } from "@cloudflare/workers-utils";

/**
 * CLI args that attach a zone to the routes passed via `--route`.
 *
 * Shared by `wrangler deploy` and `wrangler triggers deploy`.
 */
export const routeZoneArgs = {
	zone: {
		describe:
			"Zone name for the routes passed via --route. Pass one value to apply it to all routes, or one value per --route in the same order",
		alias: "zones",
		type: "string",
		requiresArg: true,
		array: true,
	},
	"zone-id": {
		describe:
			"Zone ID for the routes passed via --route. Pass one value to apply it to all routes, or one value per --route in the same order",
		alias: "zone-ids",
		type: "string",
		requiresArg: true,
		array: true,
	},
} satisfies NamedArgDefinitions;

export type RouteZoneArgs = {
	routes?: string[];
	zone?: string[];
	zoneId?: string[];
};

/**
 * Validates the combination of `--route`, `--zone` and `--zone-id` args.
 *
 * - `--zone` and `--zone-id` are mutually exclusive
 * - zone args require at least one `--route`
 * - either a single zone value (applied to all routes) or exactly one per route
 *
 * Throws a `CommandLineArgsError` with an actionable message otherwise.
 */
export function validateRouteZoneArgs(args: RouteZoneArgs): void {
	const zoneNames = args.zone ?? [];
	const zoneIds = args.zoneId ?? [];

	if (zoneNames.length > 0 && zoneIds.length > 0) {
		throw new CommandLineArgsError(
			"Conflicting options: --zone and --zone-id cannot be used together. Please provide only one.",
			{ telemetryMessage: "route zone args mutually exclusive options" }
		);
	}

	const flag = zoneNames.length > 0 ? "--zone" : "--zone-id";
	const zones = zoneNames.length > 0 ? zoneNames : zoneIds;
	if (zones.length === 0) {
		return;
	}

	const routes = args.routes ?? [];
	if (routes.length === 0) {
		throw new CommandLineArgsError(
			`${flag} can only be used together with --route. To attach a zone to routes defined in your config file, set "zone_name" or "zone_id" on each route there instead.`,
			{ telemetryMessage: "route zone args without routes" }
		);
	}

	if (zones.length > 1 && zones.length !== routes.length) {
		throw new CommandLineArgsError(
			`Received ${zones.length} ${flag} values for ${routes.length} --route values. Pass either a single ${flag} value to apply to all routes, or exactly one ${flag} value per --route in the same order.`,
			{ telemetryMessage: "route zone args count mismatch" }
		);
	}
}

/**
 * Converts the string routes from `--route` into route objects carrying the
 * zone from `--zone` / `--zone-id`. A single zone value applies to all routes,
 * otherwise zones are paired with routes by position.
 *
 * Returns the routes unchanged when no zone args were given, so the existing
 * behaviour is preserved.
 */
export function applyZoneArgsToRoutes(
	routes: string[],
	args: Pick<RouteZoneArgs, "zone" | "zoneId">
): Route[] {
	const zoneNames = args.zone ?? [];
	if (zoneNames.length > 0) {
		return routes.map((pattern, i) => ({
			pattern,
			zone_name: zoneNames.length === 1 ? zoneNames[0] : zoneNames[i],
		}));
	}

	const zoneIds = args.zoneId ?? [];
	if (zoneIds.length > 0) {
		return routes.map((pattern, i) => ({
			pattern,
			zone_id: zoneIds.length === 1 ? zoneIds[0] : zoneIds[i],
		}));
	}

	return routes;
}
