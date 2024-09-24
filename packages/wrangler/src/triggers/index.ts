import { processAssetsArg } from "../assets";
import { readConfig } from "../config";
import { getScriptName, isLegacyEnv, printWranglerBanner } from "../index";
import * as metrics from "../metrics";
import { requireAuth } from "../user";
import triggersDeploy from "./deploy";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";

export default function registerTriggersSubcommands(
	triggersYargs: CommonYargsArgv
) {
	triggersYargs.command(
		"deploy",
		"Updates the triggers of your current deployment [beta]",
		triggersDeployOptions,
		triggersDeployHandler
	);
}

export function triggersDeployOptions(yargs: CommonYargsArgv) {
	return yargs
		.option("name", {
			describe: "Name of the worker",
			type: "string",
			requiresArg: true,
		})
		.option("triggers", {
			describe: "cron schedules to attach",
			alias: ["schedule", "schedules"],
			type: "string",
			requiresArg: true,
			array: true,
		})
		.option("routes", {
			describe: "Routes to upload",
			alias: "route",
			type: "string",
			requiresArg: true,
			array: true,
		})
		.option("dry-run", {
			describe: "Don't actually deploy",
			type: "boolean",
		})
		.option("legacy-env", {
			type: "boolean",
			describe: "Use legacy environments",
			hidden: true,
		});
}

export async function triggersDeployHandler(
	args: StrictYargsOptionsToInterface<typeof triggersDeployOptions>
) {
	await printWranglerBanner();

	const config = readConfig(undefined, args);
	const assetsOptions = processAssetsArg({ assets: undefined }, config);
	await metrics.sendMetricsEvent(
		"deploy worker triggers",
		{},
		{
			sendMetrics: config.send_metrics,
		}
	);

	const accountId = args.dryRun ? undefined : await requireAuth(config);

	await triggersDeploy({
		config,
		accountId,
		name: getScriptName(args, config),
		env: args.env,
		triggers: args.triggers,
		routes: args.routes,
		legacyEnv: isLegacyEnv(config),
		dryRun: args.dryRun,
		experimentalVersions: args.experimentalJsonConfig,
		assetsOptions,
	});
}
