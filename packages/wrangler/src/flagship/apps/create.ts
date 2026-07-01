import { dim } from "@cloudflare/cli-shared-helpers/colors";
import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { createApp } from "../client";
import { renderApp } from "../render";

export const flagshipAppsCreateCommand = createCommand({
	metadata: {
		description: "Create a Flagship app",
		status: "open beta",
		owner: "Product: Flagship",
	},
	behaviour: {
		printBanner: (args) => !args.json,
	},
	args: {
		name: {
			type: "string",
			demandOption: true,
			description: "The name of the app",
		},
		json: {
			type: "boolean",
			default: false,
			description: "Return output as JSON",
		},
	},
	positionalArgs: ["name"],
	async handler({ name, json }, { config }) {
		const app = await createApp(config, name);
		if (json) {
			logger.json(app);
			return;
		}
		logger.log(`✅ Created Flagship app\n`);
		logger.log(renderApp(app));
		logger.log(
			`\n${dim("Bind this app to a Worker by adding to your Wrangler configuration:")}`
		);
		logger.log(
			JSON.stringify(
				{ flagship: [{ binding: "FLAGS", app_id: app.id }] },
				null,
				2
			)
		);
	},
});
