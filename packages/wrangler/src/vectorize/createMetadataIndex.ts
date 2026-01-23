import { createCommand } from "../core/create-command";
import { logger } from "../logger";
import { createMetadataIndex } from "./client";
import type {
	VectorizeMetadataIndexProperty,
	VectorizeVectorMetadataValueString,
} from "./types";

export const vectorizeCreateMetadataIndexCommand = createCommand({
	metadata: {
		description: "Enable metadata filtering on the specified property",
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
		type: {
			type: "string",
			demandOption: true,
			choices: ["string", "number", "boolean"],
			description:
				"The type of metadata property to index. Valid types are 'string', 'number' and 'boolean'.",
		},
	},
	positionalArgs: ["name"],

	async handler(args, { config }) {
		const reqOptions: VectorizeMetadataIndexProperty = {
			propertyName: args.propertyName,
			indexType: args.type as VectorizeVectorMetadataValueString,
		};

		logger.log(`📋 Creating metadata index...`);
		const mutation = await createMetadataIndex(config, args.name, reqOptions);

		logger.log(
			`✅ Successfully enqueued metadata index creation request. Mutation changeset identifier: ${mutation.mutationId}.`
		);
	},
});
