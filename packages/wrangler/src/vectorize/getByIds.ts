import { readConfig } from "../config";
import { createCommand } from "../core/create-command";
import { logger } from "../logger";
import { getByIds } from "./client";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";
import type { VectorizeVectorIds } from "./types";

export const vectorizeGetVectorsCommand = createCommand({
	metadata: {
		description: "Get vectors from a Vectorize index",
		owner: "Product: Vectorize",
		status: "stable",
	},
	args: {
		name: {
			type: "string",
			demandOption: true,
			description: "The name of the Vectorize index.",
		},
		ids: {
			type: "string",
			array: true,
			demandOption: true,
			describe:
				"Vector identifiers to be fetched from the Vectorize Index. Example: `--ids a 'b' 1 '2'`",
		},
	},
	positionalArgs: ["name"],
	async handler(args, { config }) {
		if (args.ids.length === 0) {
			logger.error("🚨 Please provide valid vector identifiers.");
			return;
		}

		logger.log(`📋 Fetching vectors...`);

		const ids: VectorizeVectorIds = {
			ids: args.ids,
		};

		const vectors = await getByIds(config, args.name, ids);

		if (vectors.length === 0) {
			logger.warn(
				`The index does not contain vectors corresponding to the provided identifiers`
			);
			return;
		}

		logger.log(JSON.stringify(vectors, null, 2));
	},
});
