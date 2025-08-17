import { createCommand } from "../core/create-command";
import { generateOpencodeConfig } from "./config-generator";
import { detectOpencode, installOpencode } from "./opencode-manager";
import type { EphemeralDirectory } from "../paths";

export const promptCommand = createCommand({
	metadata: {
		description:
			"🤖 Launch opencode AI assistant with Cloudflare configuration",
		status: "experimental",
		owner: "Workers: Authoring and Testing",
	},
	behaviour: {
		printConfigWarnings: false,
	},
	args: {
		auth: {
			type: "boolean",
			description: "Authenticate with opencode",
			default: false,
		},
	},
	async handler(args, { logger }) {
		const isInstalled = await detectOpencode();

		if (!isInstalled) {
			logger.log("Opencode not found. Installing...");
			await installOpencode();
		}

		// Generate temporary opencode configuration
		const ocConfig = await generateOpencodeConfig(process.cwd());
		logger.debug(`Generated opencode configuration at: ${ocConfig}`);

		if (args.auth) {
			logger.log("Not yet implemented: opencode auth flow");
		} else {
			logger.log(
				"Not yet implemented: launching opencode with Cloudflare configuration"
			);
		}
	},
});
