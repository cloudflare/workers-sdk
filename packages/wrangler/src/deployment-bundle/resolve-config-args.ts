import { validateRoutes } from "@cloudflare/deploy-helpers";
import { UserError } from "@cloudflare/workers-utils";
import { getAssetsOptions } from "../assets";
import { getScriptName } from "../utils/getScriptName";
import { useServiceEnvironmentApi } from "../utils/useServiceEnvironments";
import type { triggersDeployCommand } from "../triggers";
import type { AssetsOptions, Config, Route } from "@cloudflare/workers-utils";

export { validateRoutes } from "@cloudflare/deploy-helpers";

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
