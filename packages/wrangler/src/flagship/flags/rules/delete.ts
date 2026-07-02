import { UserError } from "@cloudflare/workers-utils";
import { createCommand } from "../../../core/create-command";
import { logger } from "../../../logger";
import { getFlag, toFlagInput, updateFlag } from "../../client";
import { renderFlag } from "../../render";
import { withoutRule } from "./shared";

export const flagshipFlagsRulesDeleteCommand = createCommand({
	metadata: {
		description: "Delete one targeting rule from a feature flag",
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
		priority: {
			type: "number",
			demandOption: true,
			description: "The priority of the rule to delete",
		},
		json: {
			type: "boolean",
			default: false,
			description: "Return output as JSON",
		},
	},
	positionalArgs: ["app-id", "key"],
	async handler(args, { config }) {
		if (!Number.isInteger(args.priority) || args.priority < 1) {
			throw new UserError("Rule priority must be an integer >= 1.", {
				telemetryMessage: "flagship rule invalid priority",
			});
		}
		const { appId, key } = args;
		const current = await getFlag(config, appId, key);
		const rules = withoutRule(current.rules, args.priority);
		const flag = await updateFlag(config, appId, key, {
			...toFlagInput(current),
			rules,
		});
		if (args.json) {
			logger.json(flag);
			return;
		}
		logger.log(`✅ Deleted rule ${args.priority} from flag\n`);
		logger.log(renderFlag(flag));
	},
});
