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
import { getPackageManager } from "./package-manager";

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
	},

	async handler(args, { config }) {
		sendAutoConfigProcessStartedMetricsEvent({
			command: "wrangler setup",
			dryRun: !!args.dryRun,
		});

		const context = createWranglerAutoConfigContext();

		let result;
		try {
			result = await runAutoConfigDetection({
				command: "wrangler setup",
				wranglerConfig: config,
				context,
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

		if (!result.configured) {
			let autoConfigSummary;
			try {
				autoConfigSummary = await runAutoConfigLogic(result.details, {
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
			const { type } = await getPackageManager();
			logCompletionMessage(
				`You can now deploy with ${brandColor(
					result.details?.packageJson ? `${type} run deploy` : "wrangler deploy"
				)}`
			);
		}
	},
});
