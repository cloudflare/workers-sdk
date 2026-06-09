import { ParseError, UserError } from "@cloudflare/workers-utils";
import PQueue from "p-queue";
import {
	confirm,
	fetchListResult,
	fetchResult,
	logger,
} from "../shared/context";
import { getZoneForRoute } from "./zones";
import type { TriggerDeployment } from "../shared/types";
import type {
	ComplianceConfig,
	CustomDomainRoute,
	Route,
	ZoneIdRoute,
	ZoneNameRoute,
} from "@cloudflare/workers-utils";

export type RouteObject = ZoneIdRoute | ZoneNameRoute | CustomDomainRoute;

export type CustomDomain = {
	id: string;
	zone_id: string;
	zone_name: string;
	hostname: string;
	service: string;
	environment: string;
	enabled: boolean;
	previews_enabled: boolean;
};

type UpdatedCustomDomain = CustomDomain & { modified: boolean };
type ConflictingCustomDomain = CustomDomain & {
	external_dns_record_id?: string | null;
	external_cert_id?: string;
};

export type CustomDomainChangeset = {
	added: CustomDomain[];
	removed: CustomDomain[];
	updated: UpdatedCustomDomain[];
	conflicting: ConflictingCustomDomain[];
};

export function renderRoute(route: Route): string {
	let result = "";
	if (typeof route === "string") {
		result = route;
	} else {
		result = route.pattern;
		const isCustomDomain = Boolean(
			"custom_domain" in route && route.custom_domain
		);
		if (isCustomDomain && "zone_id" in route) {
			result += ` (custom domain - zone id: ${route.zone_id})`;
		} else if (isCustomDomain && "zone_name" in route) {
			result += ` (custom domain - zone name: ${route.zone_name})`;
		} else if (isCustomDomain) {
			result += ` (custom domain)`;
		} else if ("zone_id" in route) {
			result += ` (zone id: ${route.zone_id})`;
		} else if ("zone_name" in route) {
			result += ` (zone name: ${route.zone_name})`;
		}

		if (isCustomDomain) {
			const flags: string[] = [];
			if ("enabled" in route && route.enabled !== undefined) {
				flags.push(route.enabled ? "enabled" : "disabled");
			}
			if ("previews_enabled" in route && route.previews_enabled !== undefined) {
				flags.push(
					route.previews_enabled ? "previews: enabled" : "previews: disabled"
				);
			}
			if (flags.length > 0) {
				result += ` [${flags.join(", ")}]`;
			}
		}
	}
	return result;
}

function isAuthenticationError(e: unknown): e is ParseError {
	return e instanceof ParseError && (e as { code?: number }).code === 10000;
}

/**
 * Associate the newly deployed Worker with the given routes.
 */
export async function publishRoutes(
	complianceConfig: ComplianceConfig,
	routes: Route[],
	{
		workerUrl,
		scriptName,
		useServiceEnvironments,
		accountId,
	}: {
		workerUrl: string;
		scriptName: string;
		useServiceEnvironments: boolean;
		accountId: string;
	}
): Promise<string[]> {
	try {
		return await fetchResult(complianceConfig, `${workerUrl}/routes`, {
			// Note: PUT will delete previous routes on this script.
			method: "PUT",
			body: JSON.stringify(
				routes.map((route) =>
					typeof route !== "object" ? { pattern: route } : route
				)
			),
			headers: {
				"Content-Type": "application/json",
			},
		});
	} catch (e) {
		if (isAuthenticationError(e)) {
			// An authentication error is probably due to a known issue,
			// where the user is logged in via an API token that does not have "All Zones".
			return await publishRoutesFallback(complianceConfig, routes, {
				scriptName,
				useServiceEnvironments,
				accountId,
			});
		} else {
			throw e;
		}
	}
}
/**
 * Try updating routes for the Worker using a less optimal zone-based API.
 *
 * Compute match zones to the routes, then for each route attempt to connect it to the Worker via the zone.
 */
async function publishRoutesFallback(
	complianceConfig: ComplianceConfig,
	routes: Route[],
	{
		scriptName,
		useServiceEnvironments,
		accountId,
	}: { scriptName: string; useServiceEnvironments: boolean; accountId: string }
) {
	if (useServiceEnvironments) {
		throw new UserError(
			"Service environments combined with an API token that doesn't have 'All Zones' permissions is not supported.\n" +
				"Either turn off service environments by setting `legacy_env = true`, creating an API token with 'All Zones' permissions, or logging in via OAuth",
			{
				telemetryMessage:
					"deploy service environments require all zones permission",
			}
		);
	}
	logger.info(
		"The current authentication token does not have 'All Zones' permissions.\n" +
			"Falling back to using the zone-based API endpoint to update each route individually.\n" +
			"Note that there is no access to routes associated with zones that the API token does not have permission for.\n" +
			"Existing routes for this Worker in such zones will not be deleted."
	);

	const deployedRoutes: string[] = [];

	const queue = new PQueue({ concurrency: 10 });
	const queuePromises: Array<Promise<void>> = [];
	const zoneIdCache = new Map();

	// Collect the routes (and their zones) that will be deployed.
	const activeZones = new Map<string, string>();
	const routesToDeploy = new Map<string, string>();
	for (const route of routes) {
		queuePromises.push(
			queue.add(async () => {
				const zone = await getZoneForRoute(
					complianceConfig,
					{ route, accountId },
					zoneIdCache
				);
				if (zone) {
					activeZones.set(zone.id, zone.host);
					routesToDeploy.set(
						typeof route === "string" ? route : route.pattern,
						zone.id
					);
				}
			})
		);
	}
	await Promise.all(queuePromises.splice(0, queuePromises.length));

	// Collect the routes that are already deployed.
	const allRoutes = new Map<string, string>();
	const alreadyDeployedRoutes = new Set<string>();
	for (const [zone, host] of activeZones) {
		queuePromises.push(
			queue.add(async () => {
				try {
					for (const { pattern, script } of await fetchListResult<{
						pattern: string;
						script: string;
					}>(complianceConfig, `/zones/${zone}/workers/routes`)) {
						allRoutes.set(pattern, script);
						if (script === scriptName) {
							alreadyDeployedRoutes.add(pattern);
						}
					}
				} catch (e) {
					if (isAuthenticationError(e)) {
						e.notes.push({
							text: `This could be because the API token being used does not have permission to access the zone "${host}" (${zone}).`,
						});
					}
					throw e;
				}
			})
		);
	}
	// using Promise.all() here instead of queue.onIdle() to ensure
	// we actually throw errors that occur within queued promises.
	await Promise.all(queuePromises);

	// Deploy each route that is not already deployed.
	for (const [routePattern, zoneId] of routesToDeploy.entries()) {
		if (allRoutes.has(routePattern)) {
			const knownScript = allRoutes.get(routePattern);
			if (knownScript === scriptName) {
				// This route is already associated with this worker, so no need to hit the API.
				alreadyDeployedRoutes.delete(routePattern);
				continue;
			} else {
				throw new UserError(
					`The route with pattern "${routePattern}" is already associated with another worker called "${knownScript}".`,
					{ telemetryMessage: "route already associated with another worker" }
				);
			}
		}

		const { pattern } = await fetchResult<{ pattern: string }>(
			complianceConfig,
			`/zones/${zoneId}/workers/routes`,
			{
				method: "POST",
				body: JSON.stringify({
					pattern: routePattern,
					script: scriptName,
				}),
				headers: {
					"Content-Type": "application/json",
				},
			}
		);

		deployedRoutes.push(pattern);
	}

	if (alreadyDeployedRoutes.size) {
		logger.warn(
			"Previously deployed routes:\n" +
				"The following routes were already associated with this worker, and have not been deleted:\n" +
				[...alreadyDeployedRoutes.values()].map((route) => ` - "${route}"\n`) +
				"If these routes are not wanted then you can remove them in the dashboard."
		);
	}

	return deployedRoutes;
}

export async function publishCustomDomains(
	complianceConfig: ComplianceConfig,
	workerUrl: string,
	accountId: string,
	domains: Array<RouteObject>
): Promise<TriggerDeployment> {
	const options = {
		override_scope: true,
		override_existing_origin: false,
		override_existing_dns_record: false,
	};
	const origins = domains.map((domainRoute) => {
		return {
			hostname: domainRoute.pattern,
			zone_id: "zone_id" in domainRoute ? domainRoute.zone_id : undefined,
			zone_name: "zone_name" in domainRoute ? domainRoute.zone_name : undefined,
			enabled: "enabled" in domainRoute ? domainRoute.enabled : undefined,
			previews_enabled:
				"previews_enabled" in domainRoute
					? domainRoute.previews_enabled
					: undefined,
		};
	});

	const fail = (): TriggerDeployment => {
		return {
			targets: [],
			error: new UserError(
				domains.length > 1
					? `Publishing to ${domains.length} Custom Domains was skipped, fix conflicts and try again`
					: `Publishing to Custom Domain "${domains[0].pattern}" was skipped, fix conflict and try again`,
				{ telemetryMessage: "deploy custom domains skipped" }
			),
		};
	};

	if (!process.stdout.isTTY) {
		options.override_existing_origin = true;
		options.override_existing_dns_record = true;
	} else {
		const changeset = await fetchResult<CustomDomainChangeset>(
			complianceConfig,
			`${workerUrl}/domains/changeset?replace_state=true`,
			{
				method: "POST",
				body: JSON.stringify(origins),
				headers: {
					"Content-Type": "application/json",
				},
			}
		);

		const updatesRequired = changeset.updated.filter(
			(domain) => domain.modified
		);
		if (updatesRequired.length > 0) {
			const existing = await Promise.all(
				updatesRequired.map((domain) =>
					fetchResult<CustomDomain>(
						complianceConfig,
						`/accounts/${accountId}/workers/domains/records/${domain.id}`
					)
				)
			);
			const existingRendered = existing
				.map(
					(domain) =>
						`\t• ${domain.hostname} (used as a domain for "${domain.service}")`
				)
				.join("\n");
			const message = `Custom Domains already exist for these domains:
${existingRendered}
Update them to point to this script instead?`;
			if (!(await confirm(message))) {
				return fail();
			}
			options.override_existing_origin = true;
		}

		if (changeset.conflicting.length > 0) {
			const conflicitingRendered = changeset.conflicting
				.map((domain) => `\t• ${domain.hostname}`)
				.join("\n");
			const message = `You already have DNS records that conflict for these Custom Domains:
${conflicitingRendered}
Update them to point to this script instead?`;
			if (!(await confirm(message))) {
				return fail();
			}
			options.override_existing_dns_record = true;
		}
	}

	await fetchResult(complianceConfig, `${workerUrl}/domains/records`, {
		method: "PUT",
		body: JSON.stringify({ ...options, origins }),
		headers: {
			"Content-Type": "application/json",
		},
	});

	return { targets: domains.map((domain) => renderRoute(domain)) };
}
