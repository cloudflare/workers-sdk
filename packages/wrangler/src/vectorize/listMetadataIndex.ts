import { readConfig } from "../../../wrangler-shared/src/config";
import { logger } from "../logger";
import { listMetadataIndex } from "./client";
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
	const config = readConfig(args);

	logger.log(`📋 Fetching metadata indexes...`);
	const res = await listMetadataIndex(config, args.name);

	if (res.metadataIndexes.length === 0) {
		logger.warn(`
You haven't created any metadata indexes on this account.

Use 'wrangler vectorize create-metadata-index <name>' to create one, or visit
https://developers.cloudflare.com/vectorize/ to get started.
		`);
		return;
	}

	if (args.json) {
		logger.log(JSON.stringify(res.metadataIndexes, null, 2));
		return;
	}

	logger.table(
		res.metadataIndexes.map((index) => ({
			propertyName: index.propertyName,
			type: index.indexType,
		}))
	);
}
