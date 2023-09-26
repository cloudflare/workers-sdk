import { readConfig } from "../config";
import { logger } from "../logger";
import { insertIntoIndex } from "./client";
import { vectorizeBetaWarning } from "./common";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";
import type { VectorizeVector } from "@cloudflare/workers-types";

export function options(yargs: CommonYargsArgv) {
	return yargs
		.positional("name", {
			type: "string",
			demandOption: true,
			description: "The name of the Vectorize index.",
		})
		.options({
			vectors: {
				type: "array",
				demandOption: true,
				describe:
					"An array of one or more vectors in JSON format to insert into the index",
			},
		})
		.epilogue(vectorizeBetaWarning);
}

export async function handler(
	args: StrictYargsOptionsToInterface<typeof options>
) {
	const config = readConfig(args.config, args);

	const vectors: VectorizeVector[] = [];
	if (args.vectors) {
		// Parse each vector into a Vector type
		// Think about potential limits on args.vectors.length?
	}

	const index = await insertIntoIndex(config, args.name, vectors);
	logger.log(JSON.stringify(index, null, 2));
}
