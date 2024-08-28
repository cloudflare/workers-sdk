import { readConfig } from "../config";
import { logger } from "../logger";
import { deleteByIds } from "./client";
import { vectorizeBetaWarning } from "./common";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";
import type { VectorizeVectorIds } from "./types";

export function options(yargs: CommonYargsArgv) {
	return yargs
		.positional("name", {
			type: "string",
			demandOption: true,
			description: "The name of the Vectorize index.",
		})
		.options({
			ids: {
				type: "array",
				demandOption: true,
				describe:
					"Vector identifiers to be deleted from the Vectorize Index.  Example: `--ids a 'b' 1 '2'`",
				coerce: (arg: unknown[]) => arg.map((a) => a?.toString() ?? ""),
			},
		})
		.epilogue(vectorizeBetaWarning);
}

export async function handler(
	args: StrictYargsOptionsToInterface<typeof options>
) {
	const config = readConfig(args.config, args);

	if (args.ids.length === 0) {
		logger.error("🚨 Please provide valid vector identifiers for deletion.");
		return;
	}

	logger.log(`📋 Deleting vectors...`);

	const ids: VectorizeVectorIds = {
		ids: args.ids,
	};

	const mutation = await deleteByIds(config, args.name, ids);

	logger.log(
		`✅ Successfully enqueued ${args.ids.length} vectors into index '${args.name}' for deletion. Mutation changeset identifier: ${mutation.mutationId}.`
	);
}
