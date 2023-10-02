import { readConfig } from "../config";
import { logger } from "../logger";
import { getIndex } from "./client";
import { vectorizeBetaWarning } from "./common";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";

export function options(yargs: CommonYargsArgv) {
	return yargs
		.positional("name", {
			type: "string",
			demandOption: true,
			description: "The name of the Vectorize index.",
		})
		.option("json", {
			describe: "return output as clean JSON",
			type: "boolean",
			default: false,
		})
		.epilogue(vectorizeBetaWarning);
}

export async function handler(
	args: StrictYargsOptionsToInterface<typeof options>
) {
	const config = readConfig(args.config, args);
	const index = await getIndex(config, args.name);

	if (args.json) {
		logger.log(JSON.stringify(index, null, 2));
		return;
	}

	logger.table([
		{
			name: index.name,
			dimensions: index.config?.dimensions.toString(),
			metric: index.config?.metric,
			description: index.description || "",
			created: index.created_on,
			modified: index.modified_on,
		},
	]);
}
