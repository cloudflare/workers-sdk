import { createCommand } from "../../../core/create-command";
import { logger } from "../../../logger";
import { flagStoreArgDefinitions, withFlagStore } from "../../store";
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
		...flagStoreArgDefinitions,
	},
	positionalArgs: ["app-id", "key"],
	async handler(args, { config }) {
		const { appId, key, json } = args;
		const flag = await withFlagStore(args, config, appId, (store) =>
			store.getFlag(key)
		);
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
