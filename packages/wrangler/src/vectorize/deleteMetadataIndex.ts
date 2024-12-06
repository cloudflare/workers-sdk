import { readConfig } from "../config";
import { logger } from "../logger";
import { deleteMetadataIndex } from "./client";
import { vectorizeGABanner } from "./common";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";
import type { VectorizeMetadataIndexPropertyName } from "./types";

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
		.epilogue(vectorizeGABanner);
}

export async function handler(
	args: StrictYargsOptionsToInterface<typeof options>
) {
	const config = readConfig(args);

	const reqOptions: VectorizeMetadataIndexPropertyName = {
		propertyName: args.propertyName,
	};

	logger.log(`📋 Deleting metadata index...`);
	const mutation = await deleteMetadataIndex(config, args.name, reqOptions);

	logger.log(
		`✅ Successfully enqueued metadata index deletion request. Mutation changeset identifier: ${mutation.mutationId}.`
	);
}
