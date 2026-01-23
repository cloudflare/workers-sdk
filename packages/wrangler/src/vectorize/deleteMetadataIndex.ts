import { createCommand } from "../core/create-command";
import { logger } from "../logger";
import { deleteMetadataIndex } from "./client";
import type { VectorizeMetadataIndexPropertyName } from "./types";

export const vectorizeDeleteMetadataIndexCommand = createCommand({
	metadata: {
		description: "Delete metadata indexes",
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
		propertyName: {
			type: "string",
			demandOption: true,
			description: "The name of the metadata property to index.",
		},
	},
	positionalArgs: ["name"],
	async handler(args, { config }) {
		const reqOptions: VectorizeMetadataIndexPropertyName = {
			propertyName: args.propertyName,
		};

		logger.log(`📋 Deleting metadata index...`);
		const mutation = await deleteMetadataIndex(config, args.name, reqOptions);

		logger.log(
			`✅ Successfully enqueued metadata index deletion request. Mutation changeset identifier: ${mutation.mutationId}.`
		);
	},
});
