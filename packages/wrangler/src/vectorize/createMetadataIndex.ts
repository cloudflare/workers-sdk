import { readConfig } from "../../../wrangler-shared/src/config";
import { logger } from "../logger";
import { createMetadataIndex } from "./client";
import { vectorizeGABanner } from "./common";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";
import type {
	VectorizeMetadataIndexProperty,
	VectorizeVectorMetadataValueString,
} from "./types";

export function options(yargs: CommonYargsArgv) {
	return yargs
		.positional("name", {
			type: "string",
			demandOption: true,
			description: "The name of the Vectorize index.",
		})
		.positional("property-name", {
			type: "string",
			demandOption: true,
			description: "The name of the metadata property to index.",
		})
		.positional("type", {
			type: "string",
			demandOption: true,
			choices: ["string", "number", "boolean"],
			description:
				"The type of metadata property to index. Valid types are 'string', 'number' and 'boolean'.",
		})
		.epilogue(vectorizeGABanner);
}

export async function handler(
	args: StrictYargsOptionsToInterface<typeof options>
) {
	const config = readConfig(args);

	const reqOptions: VectorizeMetadataIndexProperty = {
		propertyName: args.propertyName,
		indexType: args.type as VectorizeVectorMetadataValueString,
	};

	logger.log(`📋 Creating metadata index...`);
	const mutation = await createMetadataIndex(config, args.name, reqOptions);

	logger.log(
		`✅ Successfully enqueued metadata index creation request. Mutation changeset identifier: ${mutation.mutationId}.`
	);
}
