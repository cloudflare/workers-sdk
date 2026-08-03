import { UserError } from "@cloudflare/workers-utils";
import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { getFlag, toFlagInput, updateFlag } from "../client";
import { renderFlag } from "../render";

export const flagshipFlagsSetCommand = createCommand({
	metadata: {
		description: "Set the default variation served by a feature flag",
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
		variation: {
			type: "string",
			alias: ["variant", "V"],
			demandOption: true,
			description: "The variation to serve by default",
		},
		"clear-rules": {
			type: "boolean",
			default: false,
			description: "Clear targeting rules so this variation is always served",
		},
		json: {
			type: "boolean",
			default: false,
			description: "Return output as JSON",
		},
	},
	positionalArgs: ["app-id", "key"],
	async handler(args, { config }) {
		const { appId, key } = args;
		const current = await getFlag(config, appId, key);
		if (!(args.variation in current.variations)) {
			throw new UserError(
				`Unknown variation "${args.variation}". Available variations: ${Object.keys(current.variations).join(", ")}`,
				{ telemetryMessage: "flagship set unknown variation" }
			);
		}
		const flag = await updateFlag(config, appId, key, {
			...toFlagInput(current),
			default_variation: args.variation,
			rules: args.clearRules ? [] : current.rules,
		});
		if (args.json) {
			logger.json(flag);
			return;
		}
		logger.log(`✅ Set default variation to "${args.variation}"\n`);
		logger.log(renderFlag(flag));
	},
});
