import chalk from "chalk";
import PQueue from "p-queue";
import { fetchListResult, fetchResult } from "../cfetch";
import {
	formatTime,
	publishCustomDomains,
	publishRoutes,
	renderRoute,
	updateQueueConsumers,
	validateRoutes,
} from "../deploy/deploy";
import { UserError } from "../errors";
import { logger } from "../logger";
import { ensureQueuesExistByConfig } from "../queues/client";
import { getWorkersDevSubdomain } from "../routes";
import { retryOnAPIFailure } from "../utils/retry";
import { getZoneForRoute } from "../zones";
import type { AssetsOptions } from "../assets";
import type { Config } from "../config";
import type { Route } from "../config/environment";
import type { RouteObject } from "../deploy/deploy";

type Props = {
	config: Config;
	accountId: string | undefined;
	name: string | undefined;
	env: string | undefined;
	triggers: string[] | undefined;
	routes: Route[] | undefined;
	legacyEnv: boolean | undefined;
	dryRun: boolean | undefined;
	assetsOptions: AssetsOptions | undefined;
};

export function getResolvedWorkersDev(
	configWorkersDev: boolean | undefined,
	routes: Route[]
): boolean {
	// resolvedWorkersDev defaults to true only if there aren't any routes defined
	const resolvedWorkersDev = configWorkersDev ?? routes.length === 0;
	return resolvedWorkersDev;
}

export default async function triggersDeploy(
	props: Props
): Promise<string[] | void> {
	const { config, accountId, name: scriptName } = props;

	const schedules = props.triggers || config.triggers?.crons;
	const routes =
		props.routes ?? config.routes ?? (config.route ? [config.route] : []) ?? [];
	const routesOnly: Array<Route> = [];
	const customDomainsOnly: Array<RouteObject> = [];
	validateRoutes(routes, props.assetsOptions);
	for (const route of routes) {
		if (typeof route !== "string" && route.custom_domain) {
			customDomainsOnly.push(route);
		} else {
			routesOnly.push(route);
		}
	}

	// deployToWorkersDev defaults to true only if there aren't any routes defined
	const deployToWorkersDev = getResolvedWorkersDev(config.workers_dev, routes);

	if (!scriptName) {
		throw new UserError(
			'You need to provide a name when uploading a Worker Version. Either pass it as a cli arg with `--name <name>` or in your config file as `name = "<name>"`',
			{ telemetryMessage: true }
		);
	}

	const envName = props.env ?? "production";

	const start = Date.now();
	const notProd = Boolean(!props.legacyEnv && props.env);
	const workerName = notProd ? `${scriptName} (${envName})` : scriptName;
	const workerUrl = notProd
		? `/accounts/${accountId}/workers/services/${scriptName}/environments/${envName}`
		: `/accounts/${accountId}/workers/scripts/${scriptName}`;

	const {
		enabled: available_on_subdomain,
		previews_enabled: previews_available_on_subdomain,
	} = await fetchResult<{
		enabled: boolean;
		previews_enabled: boolean;
	}>(config, `${workerUrl}/subdomain`);

	if (!props.dryRun) {
		await ensureQueuesExistByConfig(config);
	}

	if (props.dryRun) {
		logger.log(`--dry-run: exiting now.`);
		return;
	}

	if (!accountId) {
		throw new UserError("Missing accountId", { telemetryMessage: true });
	}

	const uploadMs = Date.now() - start;
	const deployments: Promise<string[]>[] = [];

	const deploymentInSync = deployToWorkersDev === available_on_subdomain;
	const previewsInSync =
		config.preview_urls === previews_available_on_subdomain;

	if (deployToWorkersDev) {
		// Deploy to a subdomain of `workers.dev`
		const userSubdomain = await getWorkersDevSubdomain(
			config,
			accountId,
			config.configPath
		);

		const deploymentURL =
			props.legacyEnv || !props.env
				? `${scriptName}.${userSubdomain}`
				: `${envName}.${scriptName}.${userSubdomain}`;

		if (deploymentInSync && previewsInSync) {
			deployments.push(Promise.resolve([deploymentURL]));
		} else {
			// Enable the `workers.dev` subdomain.
			deployments.push(
				fetchResult(config, `${workerUrl}/subdomain`, {
					method: "POST",
					body: JSON.stringify({
						enabled: true,
						previews_enabled: config.preview_urls,
					}),
					headers: {
						"Content-Type": "application/json",
					},
				}).then(() => [deploymentURL])
			);
		}
	}
	if (!deployToWorkersDev && (!deploymentInSync || !previewsInSync)) {
		// Disable the workers.dev deployment
		await fetchResult(config, `${workerUrl}/subdomain`, {
			method: "POST",
			body: JSON.stringify({
				enabled: false,
				previews_enabled: config.preview_urls,
			}),
			headers: {
				"Content-Type": "application/json",
			},
		});
	}
	if (!deployToWorkersDev && deploymentInSync && routes.length !== 0) {
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
						routesInZone = retryOnAPIFailure(() =>
							fetchListResult<{
								pattern: string;
								script: string;
							}>(config, `/zones/${zone.id}/workers/routes`)
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

			throw new UserError(`${errorMessage}\n${resolution}\n${dashLink}`);
		}
	}

	// Update routing table for the script.
	if (routesOnly.length > 0) {
		deployments.push(
			publishRoutes(config, routesOnly, {
				workerUrl,
				scriptName,
				notProd,
				accountId,
			}).then(() => {
				if (routesOnly.length > 10) {
					return routesOnly
						.slice(0, 9)
						.map((route) => renderRoute(route))
						.concat([`...and ${routesOnly.length - 10} more routes`]);
				}
				return routesOnly.map((route) => renderRoute(route));
			})
		);
	}

	// Update custom domains for the script
	if (customDomainsOnly.length > 0) {
		deployments.push(
			publishCustomDomains(config, workerUrl, accountId, customDomainsOnly)
		);
	}

	// Configure any schedules for the script.
	// If schedules is not defined then we just leave whatever is previously deployed alone.
	// If it is an empty array we will remove all schedules.
	if (schedules) {
		deployments.push(
			fetchResult(config, `${workerUrl}/schedules`, {
				// Note: PUT will override previous schedules on this script.
				method: "PUT",
				body: JSON.stringify(schedules.map((cron) => ({ cron }))),
				headers: {
					"Content-Type": "application/json",
				},
			}).then(() => schedules.map((trigger) => `schedule: ${trigger}`))
		);
	}

	if (config.queues.producers && config.queues.producers.length) {
		deployments.push(
			...config.queues.producers.map((producer) =>
				Promise.resolve([`Producer for ${producer.queue}`])
			)
		);
	}

	if (config.queues.consumers && config.queues.consumers.length) {
		const updateConsumers = await updateQueueConsumers(scriptName, config);

		deployments.push(...updateConsumers);
	}

	if (config.workflows?.length) {
		for (const workflow of config.workflows) {
			// NOTE: if the user provides a script_name thats not this script (aka bounds to another worker)
			// we don't want to send this worker's config.
			if (
				workflow.script_name !== undefined &&
				workflow.script_name !== scriptName
			) {
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
						}),
						headers: {
							"Content-Type": "application/json",
						},
					}
				).then(() => [`workflow: ${workflow.name}`])
			);
		}
	}

	const targets = await Promise.all(deployments);
	const deployMs = Date.now() - start - uploadMs;

	if (deployments.length > 0) {
		logger.log(`Deployed ${workerName} triggers`, formatTime(deployMs));

		const flatTargets = targets.flat().map(
			// Append protocol only on workers.dev domains
			(target) => (target.endsWith("workers.dev") ? "https://" : "") + target
		);

		for (const target of flatTargets) {
			logger.log(" ", target);
		}
		return flatTargets;
	} else {
		logger.log("No deploy targets for", workerName, formatTime(deployMs));
	}
}
