import { createCommand } from "../core/create-command";
import { detectOpencode, installOpencode } from "./opencode-manager";

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

		if (args.auth) {
			logger.log("Not yet implemented: opencode auth flow");
		} else {
			logger.log(
				"Not yet implemented: launching opencode with Cloudflare configuration"
			);
		}
	},
});
