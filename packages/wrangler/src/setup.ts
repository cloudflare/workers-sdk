import { brandColor } from "@cloudflare/cli-shared-helpers/colors";
import {
	runAutoConfigDetection,
	runAutoConfigLogic,
	sendAutoConfigProcessEndedMetricsEvent,
	sendAutoConfigProcessStartedMetricsEvent,
} from "./autoconfig";
import { createWranglerAutoConfigContext } from "./autoconfig-context";
import { createCommand } from "./core/create-command";
import { logger } from "./logger";
import { writeOutput } from "./output";

export const setupCommand = createCommand({
	metadata: {
		description: "🪄 Setup a project to work on Cloudflare",
		owner: "Workers: Authoring and Testing",
		status: "stable",
		category: "Compute & AI",
	},
	behaviour: {
		suggestSkillsAfterHandler: true,
	},
	args: {
		yes: {
			describe: 'Answer "yes" to any prompts for configuring your project',
			type: "boolean",
			alias: "y",
			default: false,
		},
		build: {
			describe: "Run your project's build command once it has been configured",
			type: "boolean",
			default: false,
		},
		"dry-run": {
			describe:
				"Runs the command without applying any filesystem modifications",
			type: "boolean",
		},
		"completion-message": {
			describe:
				"Display a message with deployment details after `wrangler setup` is complete",
			type: "boolean",
			default: true,
			hidden: true,
		},
		"install-wrangler": {
			describe: "Install Wrangler during project setup",
			type: "boolean",
			default: true,
			hidden: true,
		},
		"experimental-auto-config-containers": {
			describe:
				"Experimental: allow auto-config to generate a Containers Worker from Dockerfile projects",
			type: "boolean",
			default: false,
		},
	},

	async handler(args, { config }) {
		sendAutoConfigProcessStartedMetricsEvent({
			command: "wrangler setup",
			dryRun: !!args.dryRun,
		});

		const context = createWranglerAutoConfigContext();

		let details;
		try {
			details = await runAutoConfigDetection({
				command: "wrangler setup",
				wranglerConfig: config,
				context,
				deployIntent: {
					trigger: "setup",
					containersAutoConfig: args.experimentalAutoConfigContainers,
				},
			});
		} catch (error) {
			sendAutoConfigProcessEndedMetricsEvent({
				command: "wrangler setup",
				dryRun: !!args.dryRun,
				success: false,
				error,
			});
			throw error;
		}

		function logCompletionMessage(message: string) {
			if (args.completionMessage) {
				logger.log(message);
			}
		}

		// Only run auto config if the project is not already configured
		if (!details.configured) {
			let autoConfigSummary;
			try {
				autoConfigSummary = await runAutoConfigLogic(details, {
					context,
					runBuild: args.build,
					skipConfirmations: args.yes,
					dryRun: !!args.dryRun,
					enableWranglerInstallation: args.installWrangler,
				});
			} catch (error) {
				sendAutoConfigProcessEndedMetricsEvent({
					command: "wrangler setup",
					dryRun: !!args.dryRun,
					success: false,
					error,
				});
				throw error;
			}

			writeOutput({
				type: "autoconfig",
				version: 1,
				command: "setup",
				summary: autoConfigSummary,
			});
			if (!args.dryRun) {
				logCompletionMessage(
					"🎉 Your project is now setup to deploy to Cloudflare"
				);
			}
		} else {
			logCompletionMessage(
				"🎉 Your project is already setup to deploy to Cloudflare"
			);
		}

		sendAutoConfigProcessEndedMetricsEvent({
			command: "wrangler setup",
			dryRun: !!args.dryRun,
			success: true,
		});

		if (!args.dryRun) {
			logCompletionMessage(
				`You can now deploy with ${brandColor(
					details.packageJson
						? `${details.packageManager.type} run deploy`
						: "wrangler deploy"
				)}`
			);
		}
	},
});
