import { triggersDeploy } from "@cloudflare/deploy-helpers";
import { createCommand, createNamespace } from "../core/create-command";
import { resolveTriggersInput } from "../deployment-bundle/resolve-config-args";
import * as metrics from "../metrics";
import { requireAuth } from "../user";

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
			default: false,
		},
		"experimental-deploy-helpers": {
			describe: "Experimental: Gates refactored deploy/upload path",
			type: "boolean",
			default: false,
			hidden: true,
			alias: ["x-deploy-helpers"],
		},
	},
	behaviour: {
		supportTemporary: true,
		useConfigRedirectIfAvailable: true,
		warnIfMultipleEnvsConfiguredButNoneSpecified: true,
		suggestSkillsAfterHandler: true,
	},
	async handler(args, { config }) {
		metrics.sendMetricsEvent("deploy worker triggers", {
			sendMetrics: config.send_metrics,
		});
		const props = resolveTriggersInput(args, config);
		const accountId = args.dryRun ? undefined : await requireAuth(config);

		await triggersDeploy({
			config,
			accountId,
			firstDeploy: false,
			dryRun: args.dryRun,
			validated: false,
			...props,
		});
	},
});
