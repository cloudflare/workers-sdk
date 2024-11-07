import { readConfig } from "../config";
import { logger } from "../logger";
import { indexInfo } from "./client";
import { vectorizeGABanner } from "./common";
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
		.epilogue(vectorizeGABanner);
}

export async function handler(
	args: StrictYargsOptionsToInterface<typeof options>
) {
	const config = readConfig(args.config, args);

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
}
