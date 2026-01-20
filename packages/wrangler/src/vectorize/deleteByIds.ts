import { UserError } from "@cloudflare/workers-utils";
import { createCommand } from "../core/create-command";
import { logger } from "../logger";
import { deleteByIds } from "./client";
import type { VectorizeVectorIds } from "./types";

export const vectorizeDeleteVectorsCommand = createCommand({
	metadata: {
		description: "Delete vectors in a Vectorize index",
		owner: "Product: Vectorize",
		status: "stable",
		logArgs: true,
	},
	args: {
		name: {
			type: "string",
			demandOption: true,
			description: "The name of the Vectorize index.",
		},
		ids: {
			type: "string",
			array: true,
			demandOption: true,
			describe:
				"Vector identifiers to be deleted from the Vectorize Index.  Example: `--ids a 'b' 1 '2'`",
		},
	},
	positionalArgs: ["name"],
	async handler(args, { config }) {
		if (args.ids.length === 0) {
			throw new UserError(
				"🚨 Please provide valid vector identifiers for deletion."
			);
		}

		logger.log(`📋 Deleting vectors...`);

		const ids: VectorizeVectorIds = {
			ids: args.ids,
		};

		const mutation = await deleteByIds(config, args.name, ids);

		logger.log(
			`✅ Successfully enqueued ${args.ids.length} vectors into index '${args.name}' for deletion. Mutation changeset identifier: ${mutation.mutationId}.`
		);
	},
});
