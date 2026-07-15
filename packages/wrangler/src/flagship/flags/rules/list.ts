import { createCommand } from "../../../core/create-command";
import { logger } from "../../../logger";
import { getFlag } from "../../client";
import { sortedRules, stringifyConditions, stringifyRollout } from "./shared";

export const flagshipFlagsRulesListCommand = createCommand({
	metadata: {
		description: "List targeting rules for a feature flag",
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
		const rules = sortedRules(flag.rules);
		if (json) {
			logger.json(rules);
			return;
		}
		if (rules.length === 0) {
			logger.log(`No targeting rules for flag '${key}'.`);
			return;
		}
		logger.table(
			rules.map((rule) => ({
				priority: String(rule.priority),
				serve: rule.serve_variation,
				rollout: stringifyRollout(rule),
				when: stringifyConditions(rule.conditions),
			}))
		);
	},
});
