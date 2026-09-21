import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { renderFlag } from "../render";
import { flagStoreArgDefinitions, withFlagStore } from "../store";

export const flagshipFlagsGetCommand = createCommand({
	metadata: {
		description: "Get a feature flag from a Flagship app",
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
		key: {
			type: "string",
			demandOption: true,
			description: "The key of the flag",
		},
		json: {
			type: "boolean",
			default: false,
			description: "Return output as JSON",
		},
		...flagStoreArgDefinitions,
	},
	positionalArgs: ["app-id", "key"],
	async handler(args, { config }) {
		const { appId, key, json } = args;
		const flag = await withFlagStore(args, config, appId, (store) =>
			store.getFlag(key)
		);
		if (json) {
			logger.json(flag);
			return;
		}
		logger.log(renderFlag(flag));
	},
});
