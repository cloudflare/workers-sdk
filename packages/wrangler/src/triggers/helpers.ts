import {
	getSubdomainMixedStateCheckDisabled,
	UserError,
} from "@cloudflare/workers-utils";
import PQueue from "p-queue";
import { fetchListResult, fetchResult } from "../cfetch";
import { isAuthenticationError } from "../core/handle-errors";
import { confirm } from "../dialogs";
import { isNonInteractiveOrCI } from "../is-interactive";
import { logger } from "../logger";
import { getQueue, postConsumer, putConsumer } from "../queues/client";
import { getWorkersDevSubdomain } from "../routes";
import { retryOnAPIFailure } from "../utils/retry";
import { getZoneForRoute } from "../zones";
import type { PostTypedConsumerBody } from "../queues/client";
import type { TriggerProps } from "./deploy";
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

// getSubdomainValues returns the values for workers_dev and preview_urls.
// Defaults are computed at the API level.
export function getSubdomainValues(
	config_workers_dev: boolean | undefined,
	config_preview_urls: boolean | undefined,
	routes: Route[]
): {
	workers_dev: boolean;
	preview_urls?: boolean;
} {
	const defaultWorkersDev = routes.length === 0; // Default to true only if there aren't any routes defined.
	const workers_dev = config_workers_dev ?? defaultWorkersDev;
	const defaultPreviewUrls = undefined; // Undefined lets the API compute the default.
	const preview_urls = config_preview_urls ?? defaultPreviewUrls;
	return {
		workers_dev,
		preview_urls,
	};
}

// getSubdomainValuesAPIMock returns the values for workers_dev and preview_urls.
// Mimics the logic in the API, ideally we would obtain defaults from the API.
export function getSubdomainValuesAPIMock(
	config_workers_dev: boolean | undefined,
	config_preview_urls: boolean | undefined,
	routes: Route[]
): {
	workers_dev: boolean;
	preview_urls: boolean;
} {
	const defaultWorkersDev = routes.length === 0; // Default to true only if there aren't any routes defined.
	const workers_dev = config_workers_dev ?? defaultWorkersDev;
	const defaultPreviewUrls = defaultWorkersDev; // Default to workers_dev status.
	const preview_urls = config_preview_urls ?? defaultPreviewUrls;
	return {
		workers_dev,
		preview_urls,
	};
}

async function validateSubdomainMixedState(
	props: TriggerProps,
	before: { workers_dev: boolean; preview_urls: boolean },
	after: { workers_dev: boolean; preview_urls: boolean }
): Promise<{
	workers_dev: boolean;
	preview_urls: boolean;
}> {
	const { config } = props;

	const changed =
		after.workers_dev !== before.workers_dev ||
		after.preview_urls !== before.preview_urls;

	// Early return if config values are the same as remote values (so we only warn on change)
	if (!changed) {
		return after;
	}

	// Early return if check disabled through environment variable.
	if (getSubdomainMixedStateCheckDisabled()) {
		return after;
	}

	// Early return if non-interactive or CI
	if (isNonInteractiveOrCI()) {
		return after;
	}

	// Early return if this is the first deploy
	if (props.firstDeploy) {
		return after;
	}

	// Early return if config values are the same (e.g. both true or both false, not in mixed state)
	if (after.workers_dev === after.preview_urls) {
		return after;
	}

	const userSubdomain = await getWorkersDevSubdomain(
		config,
		props.accountId,
		config.configPath
	);
	const previewUrl = `https://<VERSION_PREFIX>-${props.scriptName}.${userSubdomain}`;

	// Scenario 1: User disables workers.dev while having preview URLs enabled
	if (!after.workers_dev && after.preview_urls) {
		logger.warn(
			[
				"You are disabling the 'workers.dev' subdomain for this Worker, but Preview URLs are still enabled.",
				"Preview URLs will automatically generate a unique, shareable link for each new version which will be accessible at:",
				`  ${previewUrl}`,
				"",
				"To prevent this Worker from being unintentionally public, you may want to disable the Preview URLs as well by setting `preview_urls = false` in your Wrangler config file.",
			].join("\n")
		);
	}

	// Scenario 2: User enables workers.dev when Preview URLs are off
	if (after.workers_dev && !after.preview_urls) {
		logger.warn(
			[
				"You are enabling the 'workers.dev' subdomain for this Worker, but Preview URLs are still disabled.",
				"Preview URLs will automatically generate a unique, shareable link for each new version which will be accessible at:",
				`  ${previewUrl}`,
				"",
				"You may want to enable the Preview URLs as well by setting `preview_urls = true` in your Wrangler config file.",
			].join("\n")
		);
	}

	return after;
}

export async function subdomainDeploy(
	props: TriggerProps,
	envName: string,
	workerUrl: string,
	deployments: Array<Promise<string[]>>
) {
	const { config } = props;

	// Get desired subdomain enablement status.

	const { workers_dev: wantWorkersDev, preview_urls: wantPreviews } =
		getSubdomainValues(config.workers_dev, config.preview_urls, props.routes);

	// workers.dev URL is only set if we want to deploy to workers.dev.

	let workersDevURL: string | undefined;
	if (wantWorkersDev) {
		const userSubdomain = await getWorkersDevSubdomain(
			config,
			props.accountId,
			config.configPath
		);
		workersDevURL = !props.useServiceEnvironments
			? `${props.scriptName}.${userSubdomain}`
			: `${envName}.${props.scriptName}.${userSubdomain}`;
	}

	// Get current subdomain enablement status.

	const before = await fetchResult<{
		enabled: boolean;
		previews_enabled: boolean;
	}>(config, `${workerUrl}/subdomain`);

	// Update subdomain status.
	// Occasionally this update to the subdomain endpoint fails due to some internal API error,
	// we retry this request a few times to mitigate that.

	const after = await retryOnAPIFailure(async () =>
		fetchResult<{
			enabled: boolean;
			previews_enabled: boolean;
		}>(config, `${workerUrl}/subdomain`, {
			method: "POST",
			body: JSON.stringify({
				enabled: wantWorkersDev,
				previews_enabled: wantPreviews,
			}),
			headers: {
				"Content-Type": "application/json",
				"Cloudflare-Workers-Script-Api-Date": "2025-08-01",
			},
		})
	);

	// Warn about mismatching config and current values.

	if (
		!props.firstDeploy &&
		config.workers_dev == undefined &&
		after.enabled !== before.enabled
	) {
		const status = (enabled: boolean, past: boolean) => {
			if (past) {
				return enabled ? "enabled" : "disabled";
			} else {
				return enabled ? "enable" : "disable";
			}
		};
		logger.warn(
			[
				`Because 'workers_dev' is not in your Wrangler file, it will be ${status(after.enabled, true)} for this deployment by default.`,
				`To override this setting, you can ${status(before.enabled, false)} workers.dev by explicitly setting 'workers_dev = ${before.enabled}' in your Wrangler file.`,
			].join("\n")
		);
	}

	if (
		!props.firstDeploy &&
		config.preview_urls == undefined &&
		after.previews_enabled !== before.previews_enabled
	) {
		const status = (enabled: boolean, past: boolean) => {
			if (past) {
				return enabled ? "enabled" : "disabled";
			} else {
				return enabled ? "enable" : "disable";
			}
		};
		logger.warn(
			[
				`Because your 'workers.dev' route is ${status(after.enabled, true)} and your 'preview_urls' setting is not in your Wrangler file, Preview URLs will be ${status(after.previews_enabled, true)} for this deployment by default.`,
				`To override this setting, you can ${status(before.previews_enabled, false)} Preview URLs by explicitly setting 'preview_urls = ${before.previews_enabled}' in your Wrangler file.`,
			].join("\n")
		);
	}

	// Warn about mixed status.

	await validateSubdomainMixedState(
		props,
		{ workers_dev: before.enabled, preview_urls: before.previews_enabled },
		{ workers_dev: after.enabled, preview_urls: after.previews_enabled }
	);

	// Done.

	if (workersDevURL) {
		deployments.push(Promise.resolve([workersDevURL]));
	}
	return {
		wantWorkersDev,
		wantPreviews,
		workersDevInSync: before.enabled === after.enabled,
		previewsInSync: before.previews_enabled === after.previews_enabled,
	};
}

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
