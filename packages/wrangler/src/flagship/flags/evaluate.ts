import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { renderEvaluation } from "../render";
import { parseContext } from "../shared";
import { flagStoreArgDefinitions, withFlagStore } from "../store";

export const flagshipFlagsEvaluateCommand = createCommand({
	metadata: {
		description: "Evaluate a feature flag with optional context",
		status: "open beta",
		owner: "Product: Flagship",
		examples: [
			{
				command:
					"wrangler flagship flags evaluate <APP_ID> new-ui --context plan=enterprise --targeting-key user-42",
				description: "Evaluate a flag against an example context",
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
		context: {
			type: "string",
			array: true,
			alias: ["ctx", "C"],
			description: 'Evaluation context, in the form "name=value" (repeatable)',
		},
		"targeting-key": {
			type: "string",
			description: "Stable bucketing key for percentage rollouts",
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
		const { appId, key } = args;
		const context = parseContext(args.context);
		if (args.targetingKey) {
			context.targetingKey = args.targetingKey;
		}
		const result = await withFlagStore(args, config, appId, (store) =>
			store.evaluateFlag(key, context)
		);
		if (args.json) {
			logger.json(result);
			return;
		}
		logger.log(renderEvaluation(result));
	},
});
