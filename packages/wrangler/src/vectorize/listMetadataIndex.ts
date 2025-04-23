import { createCommand } from "../core/create-command";
import { logger } from "../logger";
import { listMetadataIndex } from "./client";

export const vectorizeListMetadataIndexCommand = createCommand({
	metadata: {
		description:
			"List metadata properties on which metadata filtering is enabled",
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
	},
});
