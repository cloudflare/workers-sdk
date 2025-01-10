import { getAssetsOptions } from "../assets";
import { readConfig } from "../config";
import * as metrics from "../metrics";
import { requireAuth } from "../user";
import { getScriptName } from "../utils/getScriptName";
import { isLegacyEnv } from "../utils/isLegacyEnv";
import { printWranglerBanner } from "../wrangler-banner";
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

function triggersDeployOptions(yargs: CommonYargsArgv) {
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

async function triggersDeployHandler(
	args: StrictYargsOptionsToInterface<typeof triggersDeployOptions>
) {
	await printWranglerBanner();

	const config = readConfig(args);
	const assetsOptions = getAssetsOptions({ assets: undefined }, config);
	metrics.sendMetricsEvent(
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
		assetsOptions,
	});
}
