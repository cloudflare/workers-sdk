import { readConfig } from "../config";
import { logger } from "../logger";
import { queryIndex } from "./client";
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
			query: {
				type: "string",
				demandOption: true,
				describe: "The vector value to query for",
			},
		})
		.options({
			"top-k": {
				type: "number",
				default: 3,
				describe: "The number of results (nearest neighbors) to return.",
			},
		})
		.epilogue(vectorizeBetaWarning);
}

export async function handler(
	args: StrictYargsOptionsToInterface<typeof options>
) {
	const config = readConfig(args.config, args);

	const query: VectorizeVector = { id: "a", values: [13.5] };
	if (args.query) {
		// Parse vector into a Vector type
	}

	const index = await queryIndex(config, args.name, query);
	logger.log(JSON.stringify(index, null, 2));
}
