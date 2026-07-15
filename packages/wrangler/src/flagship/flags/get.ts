import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { getFlag } from "../client";
import { renderFlag } from "../render";

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
	},
	positionalArgs: ["app-id", "key"],
	async handler({ appId, key, json }, { config }) {
		const flag = await getFlag(config, appId, key);
		if (json) {
			logger.json(flag);
			return;
		}
		logger.log(renderFlag(flag));
	},
});
