import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { updateApp } from "../client";
import { renderApp } from "../render";

export const flagshipAppsUpdateCommand = createCommand({
	metadata: {
		description: "Update a Flagship app",
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
		name: {
			type: "string",
			demandOption: true,
			description: "The new name of the app",
		},
		json: {
			type: "boolean",
			default: false,
			description: "Return output as JSON",
		},
	},
	positionalArgs: ["app-id"],
	async handler({ appId, name, json }, { config }) {
		const app = await updateApp(config, appId, name);
		if (json) {
			logger.json(app);
			return;
		}
		logger.log(`✅ Updated Flagship app\n`);
		logger.log(renderApp(app));
	},
});
