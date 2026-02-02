import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { listVectors } from "./client";

export const vectorizeListVectorsCommand = createCommand({
	metadata: {
		description: "List vector identifiers in a Vectorize index",
		status: "stable",
		owner: "Product: Vectorize",
		examples: [
			{
				command: "wrangler vectorize list-vectors my-index",
				description: "List vector identifiers in the index 'my-index'",
			},
			{
				command: "wrangler vectorize list-vectors my-index --count 50",
				description: "List up to 50 vector identifiers",
			},
			{
				command: "wrangler vectorize list-vectors my-index --cursor abc123",
				description: "Continue listing from a specific cursor position",
			},
		],
	},
	behaviour: {
		printBanner: (args) => !args.json,
	},
	args: {
		name: {
			type: "string",
			demandOption: true,
			description: "The name of the Vectorize index",
		},
		count: {
			type: "number",
			description: "Maximum number of vectors to return (1-1000)",
		},
		cursor: {
			type: "string",
			description: "Cursor for pagination to get the next page of results",
		},
		json: {
			type: "boolean",
			default: false,
			description: "Return output as clean JSON",
		},
	},
	positionalArgs: ["name"],
	async handler(args, { config }) {
		if (!args.json) {
			logger.log(`📋 Listing vectors in index '${args.name}'...`);
		}

		const options: Parameters<typeof listVectors>[2] = {};
		if (args.count !== undefined) {
			options.count = args.count;
		}
		if (args.cursor) {
			options.cursor = args.cursor;
		}

		const result = await listVectors(config, args.name, options);

		if (result.vectors.length === 0) {
			logger.warn("No vectors found in this index.");
			return;
		}

		if (args.json) {
			logger.log(JSON.stringify(result, null, 2));
			return;
		}

		logger.table(
			result.vectors.map((vector, index) => ({
				"#": (index + 1).toString(),
				"Vector ID": vector.id,
			}))
		);

		logger.log(
			`\nShowing ${result.count} of ${result.totalCount} total vectors`
		);

		if (result.isTruncated && result.nextCursor) {
			logger.log(`\n💡 To get the next page, run:`);
			logger.log(
				`   wrangler vectorize list-vectors ${args.name} --cursor ${result.nextCursor}`
			);
		}
	},
});
