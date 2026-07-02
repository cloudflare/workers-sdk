import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import {
	createdResourceConfig,
	sharedResourceCreationArgs,
} from "../../utils/add-created-resource-config";
import { getValidBindingName } from "../../utils/getValidBindingName";
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
		...sharedResourceCreationArgs,
	},
	positionalArgs: ["name"],
	async handler(args, { config }) {
		const { name, json } = args;
		const app = await createApp(config, name);
		if (json) {
			logger.json(app);
			return;
		}
		logger.log(`✅ Created Flagship app\n`);
		logger.log(renderApp(app));

		await createdResourceConfig(
			"flagship",
			(bindingName) => ({
				binding: getValidBindingName(bindingName ?? app.name, "FLAGS"),
				app_id: app.id,
			}),
			config.configPath,
			args.env,
			args
		);
	},
});
