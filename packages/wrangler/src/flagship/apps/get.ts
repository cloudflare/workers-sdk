import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { getApp } from "../client";
import { renderApp } from "../render";

export const flagshipAppsGetCommand = createCommand({
	metadata: {
		description: "Get a Flagship app",
		status: "open beta",
		owner: "Product: Flagship",
	},
	behaviour: {
		printBanner: (args) => !args.json,
	},
	args: {
		"app-id": {
			type: "string",
			demandOption: true,
			description: "The ID of the app",
		},
		json: {
			type: "boolean",
			default: false,
			description: "Return output as JSON",
		},
	},
	positionalArgs: ["app-id"],
	async handler({ appId, json }, { config }) {
		const app = await getApp(config, appId);
		if (json) {
			logger.json(app);
			return;
		}
		logger.log(renderApp(app));
	},
});
