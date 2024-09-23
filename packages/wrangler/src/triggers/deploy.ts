import chalk from "chalk";
import { fetchListResult, fetchResult } from "../cfetch";
import {
	formatTime,
	publishCustomDomains,
	publishRoutes,
	renderRoute,
	sleep,
	updateQueueConsumers,
	updateQueueProducers,
	validateRoutes,
} from "../deploy/deploy";
import { UserError } from "../errors";
import { logger } from "../logger";
import { ensureQueuesExistByConfig } from "../queues/client";
import { getWorkersDevSubdomain } from "../routes";
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
	routes: string[] | undefined;
	legacyEnv: boolean | undefined;
	dryRun: boolean | undefined;
	experimentalVersions: boolean | undefined;
	assetsOptions: AssetsOptions | undefined;
};

export default async function triggersDeploy(
	props: Props
): Promise<string[] | void> {
	const { config, accountId, name: scriptName } = props;

	const triggers = props.triggers || config.triggers?.crons;
	const routes =
		props.routes ?? config.routes ?? (config.route ? [config.route] : []) ?? [];
	const routesOnly: Array<Route> = [];
	const customDomainsOnly: Array<RouteObject> = [];
	validateRoutes(routes, Boolean(props.assetsOptions));
	for (const route of routes) {
		if (typeof route !== "string" && route.custom_domain) {
			customDomainsOnly.push(route);
		} else {
			routesOnly.push(route);
		}
	}

	// deployToWorkersDev defaults to true only if there aren't any routes defined
	const deployToWorkersDev = config.workers_dev ?? routes.length === 0;

	if (!scriptName) {
		throw new UserError(
			'You need to provide a name when uploading a Worker Version. Either pass it as a cli arg with `--name <name>` or in your config file as `name = "<name>"`'
		);
	}

	const envName = props.env ?? "production";

	const start = Date.now();
	const notProd = Boolean(!props.legacyEnv && props.env);
	const workerName = notProd ? `${scriptName} (${envName})` : scriptName;
	const workerUrl = notProd
		? `/accounts/${accountId}/workers/services/${scriptName}/environments/${envName}`
		: `/accounts/${accountId}/workers/scripts/${scriptName}`;

	const { enabled: available_on_subdomain } = await fetchResult<{
		enabled: boolean;
	}>(`${workerUrl}/subdomain`);

	if (!props.dryRun) {
		await ensureQueuesExistByConfig(config);
	}

	if (props.dryRun) {
		logger.log(`--dry-run: exiting now.`);
		return;
	}

	if (!accountId) {
		throw new UserError("Missing accountId");
	}

	const uploadMs = Date.now() - start;
	const deployments: Promise<string[]>[] = [];

	if (deployToWorkersDev) {
		// Deploy to a subdomain of `workers.dev`
		const userSubdomain = await getWorkersDevSubdomain(accountId);
		const scriptURL =
			props.legacyEnv || !props.env
				? `${scriptName}.${userSubdomain}.workers.dev`
				: `${envName}.${scriptName}.${userSubdomain}.workers.dev`;
		if (!available_on_subdomain) {
			// Enable the `workers.dev` subdomain.
			deployments.push(
				fetchResult(`${workerUrl}/subdomain`, {
					method: "POST",
					body: JSON.stringify({ enabled: true }),
					headers: {
						"Content-Type": "application/json",
					},
				})
					.then(() => [scriptURL])
					// Add a delay when the subdomain is first created.
					// This is to prevent an issue where a negative cache-hit
					// causes the subdomain to be unavailable for 30 seconds.
					// This is a temporary measure until we fix this on the edge.
					.then(async (url) => {
						await sleep(3000);
						return url;
					})
			);
		} else {
			deployments.push(Promise.resolve([scriptURL]));
		}
	} else {
		if (available_on_subdomain) {
			// Disable the workers.dev deployment
			await fetchResult(`${workerUrl}/subdomain`, {
				method: "POST",
				body: JSON.stringify({ enabled: false }),
				headers: {
					"Content-Type": "application/json",
				},
			});
		} else if (routes.length !== 0) {
			// if you get to this point it's because
			// you're trying to deploy a worker to a custom
			// domain that's already bound to another worker.
			// so this thing is about finding workers that have
			// bindings to the routes you're trying to deploy to.
			//
			// the logic is kinda similar (read: duplicated) from publishRoutesFallback,
			// except here we know we have a good API token or whatever so we don't need
			// to bother with all the error handling tomfoolery.
			const routesWithOtherBindings: Record<string, string[]> = {};
			for (const route of routes) {
				const zone = await getZoneForRoute({ route, accountId });
				if (!zone) {
					continue;
				}

				const routePattern = typeof route === "string" ? route : route.pattern;
				const routesInZone = await fetchListResult<{
					pattern: string;
					script: string;
				}>(`/zones/${zone.id}/workers/routes`);

				routesInZone.forEach(({ script, pattern }) => {
					if (pattern === routePattern && script !== scriptName) {
						if (!(script in routesWithOtherBindings)) {
							routesWithOtherBindings[script] = [];
						}

						routesWithOtherBindings[script].push(pattern);
					}
				});
			}

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
	}

	// Update routing table for the script.
	if (routesOnly.length > 0) {
		deployments.push(
			publishRoutes(routesOnly, {
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
			publishCustomDomains(workerUrl, accountId, customDomainsOnly)
		);
	}

	// Configure any schedules for the script.
	// TODO: rename this to `schedules`?
	if (triggers && triggers.length) {
		deployments.push(
			fetchResult(`${workerUrl}/schedules`, {
				// Note: PUT will override previous schedules on this script.
				method: "PUT",
				body: JSON.stringify(triggers.map((cron) => ({ cron }))),
				headers: {
					"Content-Type": "application/json",
				},
			}).then(() => triggers.map((trigger) => `schedule: ${trigger}`))
		);
	}

	if (config.queues.producers && config.queues.producers.length) {
		const updateProducers = await updateQueueProducers(config);
		deployments.push(...updateProducers);
	}

	if (config.queues.consumers && config.queues.consumers.length) {
		const updateConsumers = await updateQueueConsumers(scriptName, config);

		deployments.push(...updateConsumers);
	}

	const targets = await Promise.all(deployments);
	const deployMs = Date.now() - start - uploadMs;

	if (deployments.length > 0) {
		const msg = props.experimentalVersions
			? `Deployed ${workerName} triggers`
			: `Published ${workerName}`;
		logger.log(msg, formatTime(deployMs));

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
