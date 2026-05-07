import path from "node:path";
import { UserError } from "@cloudflare/workers-utils";
import PQueue from "p-queue";
import { fetchListResult, fetchResult } from "../cfetch";
import { isAuthenticationError } from "../core/handle-errors";
import { confirm } from "../dialogs";
import { logger } from "../logger";
import { getQueue, postConsumer, putConsumer } from "../queues/client";
import { getZoneForRoute } from "../zones";
import type { AssetsOptions } from "../assets";
import type { PostTypedConsumerBody } from "../queues/client";
import type {
	ComplianceConfig,
	Config,
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
	external_dns_record_id?: string;
	external_cert_id?: string;
};

export type CustomDomainChangeset = {
	added: CustomDomain[];
	removed: CustomDomain[];
	updated: UpdatedCustomDomain[];
	conflicting: ConflictingCustomDomain[];
};

export const validateRoutes = (routes: Route[], assets?: AssetsOptions) => {
	const invalidRoutes: Record<string, string[]> = {};
	const mountedAssetRoutes: string[] = [];

	for (const route of routes) {
		if (typeof route !== "string" && route.custom_domain) {
			if (route.pattern.includes("*")) {
				invalidRoutes[route.pattern] ??= [];
				invalidRoutes[route.pattern].push(
					`Wildcard operators (*) are not allowed in Custom Domains`
				);
			}
			if (route.pattern.includes("/")) {
				invalidRoutes[route.pattern] ??= [];
				invalidRoutes[route.pattern].push(
					`Paths are not allowed in Custom Domains`
				);
			}
		} else if (
			// If we have Assets but we're not always hitting the Worker then validate
			assets?.directory !== undefined &&
			assets.routerConfig.invoke_user_worker_ahead_of_assets !== true
		) {
			const pattern = typeof route === "string" ? route : route.pattern;
			const components = pattern.split("/");

			// If this isn't `domain.com/*` then we're mounting to a path
			if (!(components.length === 2 && components[1] === "*")) {
				mountedAssetRoutes.push(pattern);
			}
		}
	}
	if (Object.keys(invalidRoutes).length > 0) {
		throw new UserError(
			`Invalid Routes:\n` +
				Object.entries(invalidRoutes)
					.map(([route, errors]) => `${route}:\n` + errors.join("\n"))
					.join(`\n\n`),
			{ telemetryMessage: "deploy invalid routes" }
		);
	}

	if (mountedAssetRoutes.length > 0 && assets?.directory !== undefined) {
		const relativeAssetsDir = path.relative(process.cwd(), assets.directory);

		logger.once.warn(
			`Warning: The following routes will attempt to serve Assets on a configured path:\n${mountedAssetRoutes
				.map((route) => {
					const routeNoScheme = route.replace(/https?:\/\//g, "");
					const assetPath = path.join(
						relativeAssetsDir,
						routeNoScheme.substring(routeNoScheme.indexOf("/"))
					);
					return `  • ${route} (Will match assets: ${assetPath})`;
				})
				.join("\n")}` +
				(assets?.routerConfig.has_user_worker
					? "\n\nRequests not matching an asset will be forwarded to the Worker's code."
					: "")
		);
	}
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

// publishing to custom domains involves a few more steps than just updating
// the routing table, and thus the api implementing it is fairly defensive -
// it will error eagerly on conflicts against existing domains or existing
// managed DNS records

// however, you can pass params to override the errors. to know if we should
// override the current state, we generate a "changeset" of required actions
// to get to the state we want (specified by the list of custom domains). the
// changeset returns an "updated" collection (existing custom domains
// connected to other scripts) and a "conflicting" collection (the requested
// custom domains that have a managed, conflicting DNS record preventing the
// host's use as a custom domain). with this information, we can prompt to
// the user what will occur if we create the custom domains requested, and
// add the override param if they confirm the action
//
// if a user does not confirm that they want to override, we skip publishing
// to these custom domains, but continue on through the rest of the
// deploy stage
export async function publishCustomDomains(
	complianceConfig: ComplianceConfig,
	workerUrl: string,
	accountId: string,
	domains: Array<RouteObject>
): Promise<string[]> {
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

	const fail = () => {
		return [
			domains.length > 1
				? `Publishing to ${domains.length} Custom Domains was skipped, fix conflicts and try again`
				: `Publishing to Custom Domain "${domains[0].pattern}" was skipped, fix conflict and try again`,
		];
	};

	if (!process.stdout.isTTY) {
		// running in non-interactive mode.
		// existing origins / dns records are not indicative of errors,
		// so we aggressively update rather than aggressively fail
		options.override_existing_origin = true;
		options.override_existing_dns_record = true;
	} else {
		// get a changeset for operations required to achieve a state with the requested domains
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
			// find out which scripts the conflict domains are already attached to
			// so we can provide that in the confirmation prompt
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

	// deploy to domains
	await fetchResult(complianceConfig, `${workerUrl}/domains/records`, {
		method: "PUT",
		body: JSON.stringify({ ...options, origins }),
		headers: {
			"Content-Type": "application/json",
		},
	});

	return domains.map((domain) => renderRoute(domain));
}

export function formatTime(duration: number) {
	return `(${(duration / 1000).toFixed(2)} sec)`;
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

export async function updateQueueConsumers(
	scriptName: string | undefined,
	config: Config
): Promise<Promise<string[]>[]> {
	const consumers = config.queues.consumers || [];
	const updateConsumers: Promise<string[]>[] = [];
	for (const consumer of consumers) {
		const queue = await getQueue(config, consumer.queue);

		if (scriptName === undefined) {
			// TODO: how can we reliably get the current script name?
			throw new UserError("Script name is required to update queue consumers", {
				telemetryMessage: "deploy queue consumers missing script name",
			});
		}

		const body: PostTypedConsumerBody = {
			type: "worker",
			dead_letter_queue: consumer.dead_letter_queue,
			script_name: scriptName,
			settings: {
				batch_size: consumer.max_batch_size,
				max_retries: consumer.max_retries,
				max_wait_time_ms:
					consumer.max_batch_timeout !== undefined
						? 1000 * consumer.max_batch_timeout
						: undefined,
				max_concurrency: consumer.max_concurrency,
				retry_delay: consumer.retry_delay,
			},
		};

		// Current script already assigned to queue?
		const existingConsumer =
			queue.consumers.filter(
				(c) => c.script === scriptName || c.service === scriptName
			).length > 0;
		const envName = undefined; // TODO: script environment for wrangler deploy?
		if (existingConsumer) {
			updateConsumers.push(
				putConsumer(config, consumer.queue, scriptName, envName, body).then(
					() => [`Consumer for ${consumer.queue}`]
				)
			);
			continue;
		}
		updateConsumers.push(
			postConsumer(config, consumer.queue, body).then(() => [
				`Consumer for ${consumer.queue}`,
			])
		);
	}

	return updateConsumers;
}
