import { UserError } from "@cloudflare/workers-utils";
import { createCommand } from "../../../core/create-command";
import { logger } from "../../../logger";
import { getFlag, toFlagInput, updateFlag } from "../../client";
import { renderFlag } from "../../render";
import {
	assertVariationsExist,
	parseConditions,
	parseRollout,
} from "../../shared";
import { findRule } from "./shared";
import type { Rule } from "../../client";

export const flagshipFlagsRulesUpdateCommand = createCommand({
	metadata: {
		description: "Update one targeting rule for a feature flag",
		status: "open beta",
		owner: "Product: Flagship",
		examples: [
			{
				command:
					"wrangler flagship flags rules update <APP_ID> new-checkout --priority 1 --rollout 50%@user_id",
				description: "Change only the rollout percentage for rule priority 1",
			},
		],
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
			description: "The priority of the rule to update",
		},
		serve: {
			type: "string",
			description: "The variation to serve when this rule matches",
		},
		when: {
			type: "string",
			description:
				"The rule conditions, using the same syntax as --rule when=...",
		},
		"clear-conditions": {
			type: "boolean",
			default: false,
			description: "Remove conditions so the rule matches all contexts",
		},
		rollout: {
			type: "string",
			description:
				'The rollout, in the form "percentage" or "percentage%@attribute"',
		},
		"clear-rollout": {
			type: "boolean",
			default: false,
			description: "Remove the rollout from this rule",
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
		if (
			args.serve === undefined &&
			args.when === undefined &&
			!args.clearConditions &&
			args.rollout === undefined &&
			!args.clearRollout
		) {
			throw new UserError(
				"Specify at least one of --serve, --when, --clear-conditions, --rollout, or --clear-rollout.",
				{ telemetryMessage: "flagship rule update missing changes" }
			);
		}
		if (args.when !== undefined && args.clearConditions) {
			throw new UserError(
				"Cannot use --when together with --clear-conditions.",
				{ telemetryMessage: "flagship rule update conflicting conditions" }
			);
		}
		if (args.rollout !== undefined && args.clearRollout) {
			throw new UserError(
				"Cannot use --rollout together with --clear-rollout.",
				{ telemetryMessage: "flagship rule update conflicting rollout" }
			);
		}

		const { appId, key } = args;
		const current = await getFlag(config, appId, key);
		findRule(current.rules, args.priority);
		const rules: Rule[] = current.rules.map((rule) =>
			rule.priority === args.priority
				? {
						...rule,
						serve_variation: args.serve ?? rule.serve_variation,
						conditions: args.clearConditions
							? []
							: args.when !== undefined
								? parseConditions(args.when)
								: rule.conditions,
						rollout: args.clearRollout
							? undefined
							: args.rollout !== undefined
								? parseRollout(args.rollout)
								: rule.rollout,
					}
				: rule
		);
		assertVariationsExist(current.variations, current.default_variation, rules);
		const flag = await updateFlag(config, appId, key, {
			...toFlagInput(current),
			rules,
		});
		if (args.json) {
			logger.json(flag);
			return;
		}
		logger.log(`✅ Updated rule ${args.priority} for flag\n`);
		logger.log(renderFlag(flag));
	},
});
