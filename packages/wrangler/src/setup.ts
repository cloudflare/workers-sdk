import { brandColor } from "@cloudflare/cli/colors";
import { getDetailsForAutoConfig } from "./autoconfig/details";
import { runAutoConfig } from "./autoconfig/run";
import { createCommand } from "./core/create-command";
import { logger } from "./logger";
import { getPackageManager } from "./package-manager";

export const setupCommand = createCommand({
	metadata: {
		description: "🪄 Setup a project to work on Cloudflare",
		owner: "Workers: Authoring and Testing",
		status: "experimental",
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
	},

	async handler(args, { config }) {
		const details = await getDetailsForAutoConfig({
			wranglerConfig: config,
		});

		// Only run auto config if the project is not already configured
		if (!details.configured) {
			await runAutoConfig(details, {
				runBuild: args.build,
				skipConfirmations: args.yes,
				dryRun: args.dryRun,
			});
			if (!args.dryRun) {
				logger.log("🎉 Your project is now setup to deploy to Cloudflare");
			}
		} else {
			logger.log("🎉 Your project is already setup to deploy to Cloudflare");
		}
		if (!args.dryRun) {
			const { type } = await getPackageManager();
			logger.log(
				`You can now deploy with ${brandColor(details.packageJson ? `${type} run deploy` : "wrangler deploy")}`
			);
		}
	},
});
