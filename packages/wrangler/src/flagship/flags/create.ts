import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { createFlag } from "../client";
import { renderFlag } from "../render";
import {
	assertConsistentVariationTypes,
	assertVariationsExist,
	buildCreateVariations,
	finalizeRules,
	parseRuleJson,
	parseRules,
} from "../shared";
import type { FlagType } from "../client";

export const flagshipFlagsCreateCommand = createCommand({
	metadata: {
		description: "Create a feature flag in a Flagship app",
		status: "open beta",
		owner: "Product: Flagship",
		examples: [
			{
				command: "wrangler flagship flags create <APP_ID> new-checkout",
				description: "Create a boolean flag with on/off variations",
			},
			{
				command:
					'wrangler flagship flags create <APP_ID> checkout-flow -V v1=old -V v2=new --default v1 --rule "serve=v2; when=plan equals enterprise OR plan equals team"',
				description: "Create a string flag with an OR targeting rule",
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
		variation: {
			type: "string",
			array: true,
			alias: "V",
			description: 'A flag variation, in the form "name=value" (repeatable)',
		},
		"default-variation": {
			type: "string",
			alias: "default",
			description:
				"The name of the variation to serve by default (defaults to off for boolean flags, otherwise the first variation)",
		},
		type: {
			type: "string",
			choices: ["boolean", "string", "number", "json"],
			alias: "t",
			description: "The variation value type (inferred when omitted)",
		},
		description: {
			type: "string",
			alias: "d",
			description: "A description of the flag",
		},
		disabled: {
			type: "boolean",
			default: false,
			description: "Create the flag in a disabled state",
		},
		rule: {
			type: "string",
			array: true,
			description:
				'A targeting rule, e.g. "serve=on; when=plan equals pro AND region in [US,CA]; rollout=30%@user_id". Conditions support AND/OR; priority is optional and defaults to declaration order (repeatable)',
		},
		"rule-json": {
			type: "string",
			array: true,
			description: "A targeting rule as a JSON object (repeatable)",
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
		const { variations, defaultVariation } = buildCreateVariations(
			args.variation,
			args.type as FlagType
		);
		assertConsistentVariationTypes(variations);
		const default_variation = args.defaultVariation ?? defaultVariation;
		const rules = finalizeRules([
			...parseRules(args.rule ?? []),
			...parseRuleJson(args.ruleJson ?? []),
		]);
		assertVariationsExist(variations, default_variation, rules);
		const flag = await createFlag(config, appId, {
			key,
			description: args.description,
			enabled: !args.disabled,
			default_variation,
			variations,
			rules,
		});
		if (args.json) {
			logger.json(flag);
			return;
		}
		logger.log(`✅ Created flag\n`);
		logger.log(renderFlag(flag));
	},
});
