import { getAssetsOptions } from "../assets";
import { createCommand, createNamespace } from "../core/create-command";
import * as metrics from "../metrics";
import { requireAuth } from "../user";
import { getScriptName } from "../utils/getScriptName";
import { useServiceEnvironments } from "../utils/useServiceEnvironments";
import triggersDeploy from "./deploy";

export const triggersNamespace = createNamespace({
	metadata: {
		description: "🎯 Updates the triggers of your current deployment",
		status: "experimental",
		owner: "Workers: Authoring and Testing",
		category: "Compute & AI",
	},
});
export const triggersDeployCommand = createCommand({
	metadata: {
		description:
			"Apply changes to triggers (Routes or domains and Cron Triggers) when using `wrangler versions upload`",
		status: "experimental",
		owner: "Workers: Authoring and Testing",
	},
	args: {
		name: {
			describe: "Name of the worker",
			type: "string",
			requiresArg: true,
		},
		triggers: {
			describe: "cron schedules to attach",
			alias: ["schedule", "schedules"],
			type: "string",
			requiresArg: true,
			array: true,
		},
		routes: {
			describe: "Routes to upload",
			alias: "route",
			type: "string",
			requiresArg: true,
			array: true,
		},
		"dry-run": {
			describe: "Don't actually deploy",
			type: "boolean",
		},
		"legacy-env": {
			type: "boolean",
			describe: "Use legacy environments",
			hidden: true,
		},
	},
	behaviour: {
		warnIfMultipleEnvsConfiguredButNoneSpecified: true,
	},
	async handler(args, { config }) {
		const assetsOptions = getAssetsOptions({ assets: undefined }, config);
		metrics.sendMetricsEvent("deploy worker triggers", {
			sendMetrics: config.send_metrics,
		});

		const accountId = args.dryRun ? undefined : await requireAuth(config);

		await triggersDeploy({
			config,
			accountId,
			name: getScriptName(args, config),
			env: args.env,
			triggers: args.triggers,
			routes: args.routes,
			useServiceEnvironments: useServiceEnvironments(config),
			dryRun: args.dryRun,
			assetsOptions,
			firstDeploy: false, // at this point the Worker should already exist.
		});
	},
});
