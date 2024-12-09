import { readConfig } from "../config";
import { logger } from "../logger";
import { getIndex } from "./client";
import { deprecatedV1DefaultFlag, vectorizeGABanner } from "./common";
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
		.option("deprecated-v1", {
			type: "boolean",
			default: deprecatedV1DefaultFlag,
			describe:
				"Fetch a deprecated V1 Vectorize index. This must be enabled if the index was created with V1 option.",
		})
		.epilogue(vectorizeGABanner);
}

export async function handler(
	args: StrictYargsOptionsToInterface<typeof options>
) {
	const config = readConfig(args);
	const index = await getIndex(config, args.name, args.deprecatedV1);

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
