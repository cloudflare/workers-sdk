import { readConfig } from "../config";
import { logger } from "../logger";
import { listIndexes } from "./client";
import { vectorizeBetaWarning } from "./common";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";

export function options(yargs: CommonYargsArgv) {
	return yargs
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

	logger.log(`📋 Listing Vectorize indexes...`);
	const indexes = await listIndexes(config);

	if (indexes.length === 0) {
		logger.warn(`
You haven't created any indexes on this account.

Use 'wrangler vectorize create <name>' to create one, or visit
https://developers.cloudflare.com/vectorize/ to get started.
		`);
		return;
	}

	if (args.json) {
		logger.log(JSON.stringify(indexes, null, 2));
		return;
	}

	logger.table(
		indexes.map((index) => ({
			name: index.name,
			dimensions: index.config?.dimensions.toString(),
			metric: index.config?.metric,
			description: index.description ?? "",
			created: index.created_on,
			modified: index.modified_on,
		}))
	);
}
