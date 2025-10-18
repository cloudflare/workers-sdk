import { createCommand } from "../core/create-command";
import { logger } from "../logger";
import { listIndexes } from "./client";
import { deprecatedV1DefaultFlag } from "./common";

export const vectorizeListCommand = createCommand({
	metadata: {
		description: "List your Vectorize indexes",
		status: "stable",
		owner: "Product: Vectorize",
	},
	behaviour: {
		printBanner: (args) => !args.json,
	},
	args: {
		json: {
			type: "boolean",
			default: false,
			description: "Return output as clean JSON",
		},
		"deprecated-v1": {
			type: "boolean",
			default: deprecatedV1DefaultFlag,
			description: "List deprecated Vectorize V1 indexes for your account.",
		},
	},
	async handler(args, { config }) {
		if (!args.json) {
			logger.log(`📋 Listing Vectorize indexes...`);
		}
		const indexes = await listIndexes(config, args.deprecatedV1);

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
	},
});
