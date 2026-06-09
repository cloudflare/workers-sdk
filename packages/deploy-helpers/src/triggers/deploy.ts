import {
	formatTime,
	getSubdomainMixedStateCheckDisabled,
	retryOnAPIFailure,
	UserError,
} from "@cloudflare/workers-utils";
import chalk from "chalk";
import PQueue from "p-queue";
import {
	fetchListResult,
	fetchResult,
	isNonInteractiveOrCI,
	logger,
} from "../shared/context";
import {
	publishCustomDomains,
	publishRoutes,
	renderRoute,
} from "./publish-routes";
import { updateQueueConsumers } from "./queue-consumers";
import { getWorkersDevSubdomain } from "./subdomain";
import { getZoneForRoute } from "./zones";
import type { TriggerDeployment, TriggerProps } from "../shared/types";
import type { RouteObject } from "./publish-routes";
import type { Config, Route } from "@cloudflare/workers-utils";

export async function triggersDeploy(
	props: TriggerProps
): Promise<string[] | void> {
	const { config, accountId, scriptName, routes, crons } = props;

	const routesOnly: Array<Route> = [];
	const customDomainsOnly: Array<RouteObject> = [];

	for (const route of routes) {
		if (typeof route !== "string" && route.custom_domain) {
			customDomainsOnly.push(route);
		} else {
			routesOnly.push(route);
		}
	}

	const envName = props.env ?? "production";

	const start = Date.now();

	const workerUrl = props.useServiceEnvironments
		? `/accounts/${accountId}/workers/services/${scriptName}/environments/${envName}`
		: `/accounts/${accountId}/workers/scripts/${scriptName}`;

	const uploadMs = Date.now() - start;
	const deployments: Promise<TriggerDeployment>[] = [];
	const hasWorkflowsDefinedInThisScript = config.workflows.some((workflow) =>
		isWorkflowDefinedInThisScript(workflow, scriptName)
	);

	const { wantWorkersDev, workersDevInSync } = await subdomainDeploy(
		props,
		accountId,
		scriptName,
		envName,
		workerUrl,
		routes,
		deployments,
		props.firstDeploy
	);

	if (!wantWorkersDev && workersDevInSync && routes.length !== 0) {
		// TODO is this true? How does last subdomain status affect route confict??
		// Why would we only need to validate route conflicts if didn't need to
		// disable the subdomain deployment?

		// if you get to this point it's because
		// you're trying to deploy a worker to a route
		// that's already bound to another worker.
		// so this thing is about finding workers that have
		// bindings to the routes you're trying to deploy to.
		//
		// the logic is kinda similar (read: duplicated) from publishRoutesFallback,
		// except here we know we have a good API token or whatever so we don't need
		// to bother with all the error handling tomfoolery.
		const routesWithOtherBindings: Record<string, string[]> = {};

		/**
		 * This queue ensures we limit how many concurrent fetch
		 * requests we're making to the Zones API.
		 */
		const queue = new PQueue({ concurrency: 10 });
		const queuePromises: Array<Promise<void>> = [];
		const zoneRoutesCache = new Map<
			string,
			Promise<Array<{ pattern: string; script: string }>>
		>();

		const zoneIdCache = new Map();
		for (const route of routes) {
			queuePromises.push(
				queue.add(async () => {
					const zone = await getZoneForRoute(
						config,
						{ route, accountId },
						zoneIdCache
					);
					if (!zone) {
						return;
					}

					const routePattern =
						typeof route === "string" ? route : route.pattern;

					let routesInZone = zoneRoutesCache.get(zone.id);
					if (!routesInZone) {
						routesInZone = retryOnAPIFailure(
							() =>
								fetchListResult<{
									pattern: string;
									script: string;
								}>(config, `/zones/${zone.id}/workers/routes`),
							logger
						);
						zoneRoutesCache.set(zone.id, routesInZone);
					}

					(await routesInZone).forEach(({ script, pattern }) => {
						if (pattern === routePattern && script !== scriptName) {
							if (!(script in routesWithOtherBindings)) {
								routesWithOtherBindings[script] = [];
							}

							routesWithOtherBindings[script].push(pattern);
						}
					});
				})
			);
		}
		// using Promise.all() here instead of queue.onIdle() to ensure
		// we actually throw errors that occur within queued promises.
		await Promise.all(queuePromises);

		if (Object.keys(routesWithOtherBindings).length > 0) {
			let errorMessage =
				"Can't deploy routes that are assigned to another worker.\n";

			for (const worker in routesWithOtherBindings) {
				const assignedRoutes = routesWithOtherBindings[worker];
				errorMessage += `"${worker}" is already assigned to routes:\n${assignedRoutes.map(
					(r) => `  - ${chalk.underline(r)}\n`
				)}`;
			}

			const resolution =
				"Unassign other workers from the routes you want to deploy to, and then try again.";
			const dashHref = chalk.blue.underline(
				`https://dash.cloudflare.com/${accountId}/workers/overview`
			);
			const dashLink = `Visit ${dashHref} to unassign a worker from a route.`;

			throw new UserError(`${errorMessage}\n${resolution}\n${dashLink}`, {
				telemetryMessage: "triggers deploy routes assigned",
			});
		}
	}

	if (!wantWorkersDev && hasWorkflowsDefinedInThisScript) {
		await getWorkersDevSubdomain(config, accountId, {
			configPath: config.configPath,
			registrationContext: "workflows",
		});
	}

	// Update routing table for the script.
	if (routesOnly.length > 0) {
		deployments.push(
			publishRoutes(config, routesOnly, {
				workerUrl,
				scriptName,
				useServiceEnvironments: props.useServiceEnvironments,
				accountId,
			}).then(
				() => {
					if (routesOnly.length > 10) {
						return {
							targets: routesOnly
								.slice(0, 9)
								.map((route) => renderRoute(route))
								.concat([`...and ${routesOnly.length - 9} more routes`]),
						};
					}
					return { targets: routesOnly.map((route) => renderRoute(route)) };
				},
				(error) => ({ targets: [], error })
			)
		);
	}

	// Update custom domains for the script
	if (customDomainsOnly.length > 0) {
		deployments.push(
			publishCustomDomains(
				config,
				workerUrl,
				accountId,
				customDomainsOnly
			).catch((error) => ({ targets: [], error }))
		);
	}

	// Configure any schedules for the script.
	// If schedules is not defined then we just leave whatever is previously deployed alone.
	// If it is an empty array we will remove all schedules.
	if (crons) {
		deployments.push(
			fetchResult(config, `${workerUrl}/schedules`, {
				// Note: PUT will override previous schedules on this script.
				method: "PUT",
				body: JSON.stringify(crons.map((cron) => ({ cron }))),
				headers: {
					"Content-Type": "application/json",
				},
			}).then(
				() => ({
					targets: crons.map((trigger) => `schedule: ${trigger}`),
				}),
				(error) => ({ targets: [], error })
			)
		);
	}

	if (config.queues.producers && config.queues.producers.length) {
		deployments.push(
			...config.queues.producers.map((producer) =>
				Promise.resolve({ targets: [`Producer for ${producer.queue}`] })
			)
		);
	}

	if (config.queues.consumers && config.queues.consumers.length) {
		const consumerUpdates = await updateQueueConsumers(
			config,
			accountId,
			scriptName,
			config
		);
		deployments.push(...consumerUpdates);
	}

	if (config.workflows?.length) {
		// NOTE: if the user provides a script_name thats not this script (aka bounds to another worker)
		// we don't want to send this worker's config.
		// TODO: move this earlier.
		for (const workflow of config.workflows) {
			if (!isWorkflowDefinedInThisScript(workflow, scriptName)) {
				if (workflow.limits) {
					throw new UserError(
						`Workflow "${workflow.name}" has "limits" configured but references external script "${workflow.script_name}". ` +
							`Configure limits on the worker that defines the workflow.`,
						{
							telemetryMessage:
								"triggers deploy workflow limits external script",
						}
					);
				}
				if (workflow.schedules) {
					throw new UserError(
						`Workflow "${workflow.name}" has "schedules" configured but references external script "${workflow.script_name}". ` +
							`Configure schedules on the worker that defines the workflow.`,
						{
							telemetryMessage:
								"triggers deploy workflow schedules external script",
						}
					);
				}
				continue;
			}

			deployments.push(
				fetchResult(
					config,
					`/accounts/${accountId}/workflows/${workflow.name}`,
					{
						method: "PUT",
						body: JSON.stringify({
							script_name: scriptName,
							class_name: workflow.class_name,
							...(workflow.limits && { limits: workflow.limits }),
							...(workflow.schedules && {
								schedules: (Array.isArray(workflow.schedules)
									? workflow.schedules
									: [workflow.schedules]
								).map((cron) => ({ cron })),
							}),
						}),
						headers: {
							"Content-Type": "application/json",
						},
					}
				).then(
					() => ({ targets: [`workflow: ${workflow.name}`] }),
					(error) => ({ targets: [], error })
				)
			);
		}
	}

	const completedDeployments = await Promise.all(deployments);
	const deployMs = Date.now() - start - uploadMs;

	const workerName = props.useServiceEnvironments
		? `${scriptName} (${envName})`
		: scriptName;

	const targets = completedDeployments
		.flatMap((deployment) => deployment.targets)
		.map(
			// Append protocol only on workers.dev domains
			(target) => (target.endsWith("workers.dev") ? "https://" : "") + target
		);
	if (targets.length > 0) {
		logger.log(`Deployed ${workerName} triggers`, formatTime(deployMs));
		for (const target of targets) {
			logger.log(" ", target);
		}
	} else {
		logger.log("No targets deployed for", workerName, formatTime(deployMs));
	}

	const errors = completedDeployments
		.map((deployment) => deployment.error)
		.filter((error): error is Error => error !== undefined);

	if (errors.length > 0) {
		throw new UserError(
			`Some triggers failed to deploy for ${workerName}:\n` +
				errors.map((error) => `  - ${error.message}`).join("\n"),
			{
				// Preserve the original errors (with stacks and subclass info) for
				// debugging, while still presenting a single aggregated message.
				cause: new AggregateError(errors),
				// Aggregate the inner telemetry labels into a single deterministic,
				// low-cardinality label so failures still group meaningfully. Non-
				// UserError causes contribute a generic "non-user error" marker.
				telemetryMessage: `triggers deploy partial failure: ${aggregateTelemetryMessages(errors)}`,
			}
		);
	}

	return targets;
}

/**
 * Collapse the telemetry labels of a set of inner errors into a single sorted,
 * deduplicated string. Each `UserError` contributes its own `telemetryMessage`;
 * anything else contributes `"non-user error"`.
 */
function aggregateTelemetryMessages(errors: Error[]): string {
	const labels = errors.map((error) =>
		error instanceof UserError && error.telemetryMessage
			? error.telemetryMessage
			: "non-user error"
	);
	return Array.from(new Set(labels)).sort().join(", ");
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
	accountId: string,
	scriptName: string,
	before: { workers_dev: boolean; preview_urls: boolean },
	after: { workers_dev: boolean; preview_urls: boolean },
	firstDeploy: boolean
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
	if (firstDeploy) {
		return after;
	}

	// Early return if config values are the same (e.g. both true or both false, not in mixed state)
	if (after.workers_dev === after.preview_urls) {
		return after;
	}

	const userSubdomain = await getWorkersDevSubdomain(config, accountId, {
		configPath: config.configPath,
	});
	const previewUrl = `https://<VERSION_PREFIX>-${scriptName}.${userSubdomain}`;

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

async function subdomainDeploy(
	props: TriggerProps,
	accountId: string,
	scriptName: string,
	envName: string,
	workerUrl: string,
	routes: Route[],
	deployments: Promise<TriggerDeployment>[],
	firstDeploy: boolean
) {
	const { config } = props;

	// Get desired subdomain enablement status.

	const { workers_dev: wantWorkersDev, preview_urls: wantPreviews } =
		getSubdomainValues(config.workers_dev, config.preview_urls, routes);

	// workers.dev URL is only set if we want to deploy to workers.dev.
	if (wantWorkersDev) {
		const userSubdomain = await getWorkersDevSubdomain(config, accountId, {
			configPath: config.configPath,
		});
		const workersDevURL =
			!props.useServiceEnvironments || !props.env
				? `${scriptName}.${userSubdomain}`
				: `${envName}.${scriptName}.${userSubdomain}`;
		deployments.push(Promise.resolve({ targets: [workersDevURL] }));
	}

	// Get current subdomain enablement status.
	const before = await fetchResult<{
		enabled: boolean;
		previews_enabled: boolean;
	}>(config, `${workerUrl}/subdomain`);

	// Update subdomain status.
	// Occasionally this update to the subdomain endpoint fails due to some internal API error,
	// we retry this request a few times to mitigate that.
	const after = await retryOnAPIFailure(
		async () =>
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
			}),
		logger
	);

	// Warn about mismatching config and current values.
	if (
		!firstDeploy &&
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
		!firstDeploy &&
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
		accountId,
		scriptName,
		{ workers_dev: before.enabled, preview_urls: before.previews_enabled },
		{ workers_dev: after.enabled, preview_urls: after.previews_enabled },
		firstDeploy
	);

	return {
		wantWorkersDev,
		wantPreviews,
		workersDevInSync: before.enabled === after.enabled,
		previewsInSync: before.previews_enabled === after.previews_enabled,
	};
}

function isWorkflowDefinedInThisScript(
	workflow: Config["workflows"][number],
	scriptName: string
): boolean {
	return (
		workflow.script_name === undefined || workflow.script_name === scriptName
	);
}
