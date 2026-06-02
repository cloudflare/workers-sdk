import path from "node:path";
import { UserError } from "@cloudflare/workers-utils";
import { getAssetsOptions } from "../assets";
import { logger } from "../logger";
import { getScriptName } from "../utils/getScriptName";
import { useServiceEnvironmentApi } from "../utils/useServiceEnvironments";
import type { triggersDeployCommand } from "../triggers";
import type { AssetsOptions, Config, Route } from "@cloudflare/workers-utils";

/**
 * for wrangler triggers deploy - non dry-run/API calling validation and resolution
 */
export function resolveTriggersInput(
	args: (typeof triggersDeployCommand)["args"] & { domains?: string[] },
	config: Config
) {
	const assetsOptions = getAssetsOptions({
		args: { assets: undefined },
		config,
	});
	const scriptName = getScriptName(args, config);
	if (!scriptName) {
		throw new UserError(
			'You need to provide a name when uploading a Worker Version. Either pass it as a cli arg with `--name <name>` or in your config file as `name = "<name>"`',
			{ telemetryMessage: "triggers deploy missing worker name" }
		);
	}
	const useServiceEnvironments = useServiceEnvironmentApi(args, config);
	return {
		crons: resolveCronTriggers(args, config),
		useServiceEnvironments,
		routes: resolveRoutes(args, config, assetsOptions) ?? [],
		scriptName,
	};
}

function resolveRoutes(
	args: { routes?: string[]; domains?: string[] },
	config: Config,
	assetsOptions: AssetsOptions | undefined
): Route[] {
	const domainRoutes = (args.domains || []).map((domain) => ({
		pattern: domain,
		custom_domain: true,
	}));
	const routes =
		args.routes ?? config.routes ?? (config.route ? [config.route] : []);
	const allDeploymentRoutes = [...routes, ...domainRoutes];
	validateRoutes(allDeploymentRoutes, assetsOptions);
	return allDeploymentRoutes;
}

function resolveCronTriggers(args: { triggers?: string[] }, config: Config) {
	return args.triggers ?? config.triggers?.crons;
}

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
