import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { indexInfo } from "./client";

export const vectorizeInfoCommand = createCommand({
	metadata: {
		description: "Get additional details about the index",
		owner: "Product: Vectorize",
		status: "stable",
	},
	behaviour: {
		printBanner: (args) => !args.json,
	},
	args: {
		name: {
			type: "string",
			demandOption: true,
			description: "The name of the Vectorize index.",
		},
		json: {
			describe: "return output as clean JSON",
			type: "boolean",
			default: false,
		},
	},
	positionalArgs: ["name"],
	async handler(args, { config }) {
		logger.log(`📋 Fetching index info...`);
		const info = await indexInfo(config, args.name);

		if (args.json) {
			logger.log(JSON.stringify(info, null, 2));
			return;
		}

		logger.table([
			{
				dimensions: info.dimensions.toString(),
				vectorCount: info.vectorCount.toString(),
				processedUpToMutation: info.processedUpToMutation,
				processedUpToDatetime: info.processedUpToDatetime,
			},
		]);
	},
});
