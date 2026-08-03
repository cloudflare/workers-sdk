import { UserError } from "@cloudflare/workers-utils";
import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { getFlag, updateFlag } from "../client";
import { renderFlag } from "../render";
import {
	assertConsistentVariationTypes,
	assertVariationsExist,
	finalizeRules,
	parseRuleJson,
	parseRules,
	parseVariations,
} from "../shared";
import type { FlagType, Rule } from "../client";

export const flagshipFlagsUpdateCommand = createCommand({
	metadata: {
		description: "Update a feature flag in a Flagship app",
		status: "open beta",
		owner: "Product: Flagship",
		examples: [
			{
				command:
					'wrangler flagship flags update <APP_ID> new-checkout --description "Redesigned checkout experience"',
				description: "Update flag metadata",
			},
			{
				command:
					"wrangler flagship flags update <APP_ID> upload-limit --set-variation team=500",
				description: "Add or replace a variation",
			},
			{
				command:
					'wrangler flagship flags update <APP_ID> premium-banner --add-rule "serve=off; when=account_age less_than 7"',
				description: "Append a targeting rule",
			},
			{
				command:
					"wrangler flagship flags update <APP_ID> premium-banner --clear-rules",
				description: "Remove all targeting rules",
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
		enable: {
			type: "boolean",
			conflicts: "disable",
			description: "Enable the flag",
		},
		disable: {
			type: "boolean",
			conflicts: "enable",
			description: "Disable the flag",
		},
		description: {
			type: "string",
			alias: "d",
			description: 'A new description for the flag (pass "" to clear it)',
		},
		"default-variation": {
			type: "string",
			alias: "default",
			description: "The name of the variation to serve by default",
		},
		type: {
			type: "string",
			choices: ["boolean", "string", "number", "json"],
			alias: "t",
			description: "The value type used to coerce --set-variation values",
		},
		"set-variation": {
			type: "string",
			array: true,
			description: 'Add or replace a variation, in the form "name=value"',
		},
		"remove-variation": {
			type: "string",
			array: true,
			description: "Remove a variation by name",
		},
		rule: {
			type: "string",
			array: true,
			description: "Replace the flag's targeting rules (repeatable)",
		},
		"rule-json": {
			type: "string",
			array: true,
			description: "Replace the flag's targeting rules using JSON (repeatable)",
		},
		"add-rule": {
			type: "string",
			array: true,
			description:
				"Append a targeting rule, keeping the existing rules (repeatable)",
		},
		"add-rule-json": {
			type: "string",
			array: true,
			description:
				"Append a targeting rule using JSON, keeping the existing rules (repeatable)",
		},
		"clear-rules": {
			type: "boolean",
			default: false,
			description: "Remove all targeting rules",
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

		const variations = { ...current.variations };
		for (const [name, value] of Object.entries(
			parseVariations(args.setVariation ?? [], args.type as FlagType)
		)) {
			variations[name] = value;
		}
		for (const name of args.removeVariation ?? []) {
			delete variations[name];
		}
		assertConsistentVariationTypes(variations);

		const replacementRules = [
			...parseRules(args.rule ?? []),
			...parseRuleJson(args.ruleJson ?? []),
		];
		const addedRules = [
			...parseRules(args.addRule ?? []),
			...parseRuleJson(args.addRuleJson ?? []),
		];
		if (
			args.clearRules &&
			(replacementRules.length > 0 || addedRules.length > 0)
		) {
			throw new UserError(
				"Cannot use --clear-rules together with --rule, --rule-json, --add-rule, or --add-rule-json.",
				{ telemetryMessage: "flagship update conflicting rule flags" }
			);
		}
		if (replacementRules.length > 0 && addedRules.length > 0) {
			throw new UserError(
				"Cannot replace rules (--rule/--rule-json) and append rules (--add-rule/--add-rule-json) in the same command.",
				{ telemetryMessage: "flagship update conflicting rule flags" }
			);
		}

		let rules: Rule[] = current.rules;
		if (args.clearRules) {
			rules = [];
		} else if (replacementRules.length > 0) {
			rules = finalizeRules(replacementRules);
		} else if (addedRules.length > 0) {
			rules = [
				...current.rules,
				...finalizeRules(addedRules, { existing: current.rules }),
			];
		}

		const default_variation =
			args.defaultVariation ?? current.default_variation;
		assertVariationsExist(variations, default_variation, rules);

		const flag = await updateFlag(config, appId, key, {
			key: current.key,
			description:
				args.description === undefined
					? current.description
					: args.description === ""
						? null
						: args.description,
			enabled: args.enable ? true : args.disable ? false : current.enabled,
			default_variation,
			variations,
			rules,
		});

		if (args.json) {
			logger.json(flag);
			return;
		}
		logger.log(`✅ Updated flag\n`);
		logger.log(renderFlag(flag));
	},
});
