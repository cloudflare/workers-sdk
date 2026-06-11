import {
	getHostFromRoute,
	retryOnAPIFailure,
	UserError,
} from "@cloudflare/workers-utils";
import { fetchListResult, logger } from "../shared/context";
import type { ComplianceConfig, Route } from "@cloudflare/workers-utils";

export interface Zone {
	id: string;
	host: string;
}

export type ZoneIdCache = Map<string, Promise<string | null>>;

export async function getZoneForRoute(
	complianceConfig: ComplianceConfig,
	from: {
		route: Route;
		accountId: string;
	},
	zoneIdCache: ZoneIdCache = new Map()
): Promise<Zone | undefined> {
	const { route, accountId } = from;
	const host = getHostFromRoute(route);
	let id: string | undefined;

	if (typeof route === "object" && "zone_id" in route) {
		id = route.zone_id;
	} else if (typeof route === "object" && "zone_name" in route) {
		id = await getZoneIdFromHost(
			complianceConfig,
			{ host: route.zone_name, accountId },
			zoneIdCache
		);
	} else if (host) {
		id = await getZoneIdFromHost(
			complianceConfig,
			{ host, accountId },
			zoneIdCache
		);
	}

	return id && host ? { id, host } : undefined;
}

/**
 * Given something that resembles a host, try to infer a zone id from it.
 *
 * It's hard to get a 'valid' domain from a string, so we don't even try to validate TLDs, etc.
 * For each domain-like part of the host (e.g. w.x.y.z) try to get a zone id for it by
 * lopping off subdomains until we get a hit from the API.
 */
export async function getZoneIdFromHost(
	complianceConfig: ComplianceConfig,
	from: {
		host: string;
		accountId: string;
	},
	zoneIdCache: ZoneIdCache = new Map()
): Promise<string> {
	const hostPieces = from.host.split(".");

	while (hostPieces.length > 1) {
		const cacheKey = `${from.accountId}:${hostPieces.join(".")}`;
		if (!zoneIdCache.has(cacheKey)) {
			zoneIdCache.set(
				cacheKey,
				retryOnAPIFailure(
					() =>
						fetchListResult<{ id: string }>(
							complianceConfig,
							`/zones`,
							{},
							new URLSearchParams({
								name: hostPieces.join("."),
								"account.id": from.accountId,
							})
						),
					logger
				).then((zones) => zones[0]?.id ?? null)
			);
		}

		const cachedZone = await zoneIdCache.get(cacheKey);
		if (cachedZone) {
			return cachedZone;
		}

		hostPieces.shift();
	}

	throw new UserError(
		`Could not find zone for \`${from.host}\`. Make sure the domain is set up to be proxied by Cloudflare.\nFor more details, refer to https://developers.cloudflare.com/workers/configuration/routing/routes/#set-up-a-route`,
		{ telemetryMessage: "zones route zone not found" }
	);
}
