import { createCommand } from "../core/create-command";

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
		if (args.auth) {
			logger.log("Not yet implemented: opencode auth");
		} else {
			logger.log("Not yet implemented: launch opencode");
		}
	},
});
