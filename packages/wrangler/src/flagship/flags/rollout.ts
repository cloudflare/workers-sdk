import { UserError } from "@cloudflare/workers-utils";
import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { getFlag, toFlagInput, updateFlag } from "../client";
import { renderFlag } from "../render";
import { confirmRuleReplacement } from "../shared";

export const flagshipFlagsRolloutCommand = createCommand({
	metadata: {
		description: "Roll out one variation to a percentage of traffic",
		status: "open beta",
		owner: "Product: Flagship",
		examples: [
			{
				command:
					"wrangler flagship flags rollout <APP_ID> new-ui --to on --percentage 25 --by user_id",
				description: "Serve the on variation to 25% of traffic",
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
		to: {
			type: "string",
			demandOption: true,
			description: "Variation to roll out",
		},
		percentage: {
			type: "number",
			demandOption: true,
			description:
				"Percentage of traffic to serve the rollout variation (0-100)",
		},
		by: {
			type: "string",
			description: "Context attribute used for sticky bucketing",
		},
		"from-variation": {
			type: "string",
			alias: "from",
			description: "Fallback variation for the remaining traffic",
		},
		force: {
			type: "boolean",
			alias: "y",
			default: false,
			description:
				"Skip the confirmation prompt when this rollout replaces existing targeting rules",
		},
		json: {
			type: "boolean",
			default: false,
			description: "Return output as JSON",
		},
	},
	positionalArgs: ["app-id", "key"],
	async handler(args, { config, confirm }) {
		const { appId, key } = args;
		if (
			!Number.isFinite(args.percentage) ||
			args.percentage < 0 ||
			args.percentage > 100
		) {
			throw new UserError("--percentage must be between 0 and 100.", {
				telemetryMessage: "flagship rollout invalid percentage",
			});
		}
		const current = await getFlag(config, appId, key);
		if (!(args.to in current.variations)) {
			throw new UserError(
				`Unknown variation "${args.to}". Available variations: ${Object.keys(current.variations).join(", ")}`,
				{ telemetryMessage: "flagship rollout unknown variation" }
			);
		}
		const clearing = args.percentage === 0;
		const fallback = args.fromVariation ?? current.default_variation;
		if (!clearing && !(fallback in current.variations)) {
			throw new UserError(
				`Unknown fallback variation "${fallback}". Available variations: ${Object.keys(current.variations).join(", ")}`,
				{ telemetryMessage: "flagship rollout unknown fallback variation" }
			);
		}
		const confirmed = await confirmRuleReplacement(current.rules, {
			json: args.json,
			force: args.force,
			action: "rollout",
			confirm,
		});
		if (!confirmed) {
			logger.log("Aborting rollout.");
			return;
		}
		const flag = await updateFlag(config, appId, key, {
			...toFlagInput(current),
			default_variation: clearing ? current.default_variation : fallback,
			rules: clearing
				? []
				: [
						{
							priority: 1,
							conditions: [],
							serve_variation: args.to,
							rollout: {
								percentage: args.percentage,
								attribute: args.by,
							},
						},
					],
		});
		if (args.json) {
			logger.json(flag);
			return;
		}
		logger.log(`✅ Updated rollout for flag\n`);
		logger.log(renderFlag(flag));
	},
});
