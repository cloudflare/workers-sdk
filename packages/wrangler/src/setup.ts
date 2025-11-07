import { brandColor } from "@cloudflare/cli/colors";
import { getDetailsForAutoConfig } from "./autoconfig/details";
import { runAutoConfig } from "./autoconfig/run";
import { createCommand } from "./core/create-command";
import { logger } from "./logger";

export const setupCommand = createCommand({
	metadata: {
		description: "🆙 Setup a project to work on Cloudflare",
		owner: "Workers: Authoring and Testing",
		status: "experimental",
	},
	behaviour: {
		provideConfig: false,
	},

	async handler(args, { config }) {
		const details = await getDetailsForAutoConfig({
			wranglerConfig: config,
		});

		// Only run auto config if the project is not already configured
		if (!details.configured) {
			await runAutoConfig(details);
		} else {
			logger.log("🎉 Your project is already setup to deploy to Cloudflare");
		}
		logger.log(`You can now deploy with ${brandColor("wrangler deploy")}`);
	},
});
