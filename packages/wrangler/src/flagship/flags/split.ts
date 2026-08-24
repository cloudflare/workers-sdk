import { UserError } from "@cloudflare/workers-utils";
import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { toFlagInput } from "../client";
import { renderFlag } from "../render";
import { confirmRuleReplacement, parseWeights } from "../shared";
import { flagStoreArgDefinitions, withFlagStore } from "../store";
import type { Rule } from "../client";

export const flagshipFlagsSplitCommand = createCommand({
	metadata: {
		description: "Split traffic across variations by percentage",
		status: "open beta",
		owner: "Product: Flagship",
		examples: [
			{
				command:
					"wrangler flagship flags split <APP_ID> model --by user_id -w stable=95 -w candidate=5",
				description: "Send 5% of traffic to the candidate variation",
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
		weight: {
			type: "string",
			array: true,
			alias: "w",
			description:
				'A variation weight, in the form "variation=weight" (repeatable)',
		},
		by: {
			type: "string",
			description: "Context attribute used for sticky bucketing",
		},
		"default-variation": {
			type: "string",
			alias: "default",
			description: "Fallback variation when bucketing cannot run",
		},
		force: {
			type: "boolean",
			alias: "y",
			default: false,
			description:
				"Skip the confirmation prompt when this split replaces existing targeting rules",
		},
		json: {
			type: "boolean",
			default: false,
			description: "Return output as JSON",
		},
		...flagStoreArgDefinitions,
	},
	positionalArgs: ["app-id", "key"],
	async handler(args, { config, confirm }) {
		const { appId, key } = args;
		const flag = await withFlagStore(args, config, appId, async (store) => {
			const current = await store.getFlag(key);
			const weights = parseWeights(args.weight);
			for (const variation of Object.keys(weights)) {
				if (!(variation in current.variations)) {
					throw new UserError(
						`Unknown variation "${variation}". Available variations: ${Object.keys(current.variations).join(", ")}`,
						{ telemetryMessage: "flagship split unknown variation" }
					);
				}
			}
			const total = Object.values(weights).reduce(
				(sum, weight) => sum + weight,
				0
			);
			let cumulative = 0;
			let priority = 1;
			const rules: Rule[] = [];
			for (const [variation, weight] of Object.entries(weights)) {
				if (weight === 0) {
					continue;
				}
				cumulative += (weight / total) * 100;
				rules.push({
					priority: priority++,
					conditions: [],
					serve_variation: variation,
					rollout: {
						percentage: Math.min(100, Number(cumulative.toFixed(6))),
						attribute: args.by,
					},
				});
			}
			const confirmed = await confirmRuleReplacement(current.rules, {
				json: args.json,
				force: args.force,
				action: "split",
				confirm,
			});
			if (!confirmed) {
				return undefined;
			}
			return store.updateFlag(key, {
				...toFlagInput(current),
				default_variation: args.defaultVariation ?? current.default_variation,
				rules,
			});
		});
		if (flag === undefined) {
			logger.log("Aborting split.");
			return;
		}
		if (args.json) {
			logger.json(flag);
			return;
		}
		logger.log(`✅ Updated split for flag\n`);
		logger.log(renderFlag(flag));
	},
});
