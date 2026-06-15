import { triggersDeploy } from "@cloudflare/deploy-helpers";
import { createCommand, createNamespace } from "../core/create-command";
import { resolveTriggersInput } from "../deployment-bundle/resolve-config-args";
import { logger } from "../logger";
import * as metrics from "../metrics";
import { ensureQueuesExistByConfig } from "../queues/client";
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
		},
		"legacy-env": {
			type: "boolean",
			describe: "Use legacy environments",
			hidden: true,
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
		warnIfMultipleEnvsConfiguredButNoneSpecified: true,
		suggestSkillsAfterHandler: true,
	},
	async handler(args, { config }) {
		metrics.sendMetricsEvent("deploy worker triggers", {
			sendMetrics: config.send_metrics,
		});
		const props = resolveTriggersInput(args, config);

		if (args.dryRun) {
			logger.log(`--dry-run: exiting now.`);
			return;
		}

		// Any validation that requires auth goes below
		const accountId = await requireAuth(config);
		await ensureQueuesExistByConfig(config);

		await triggersDeploy({
			config,
			accountId,
			env: args.env,
			firstDeploy: false,
			...props,
		});
	},
});
