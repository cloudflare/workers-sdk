import { readConfig } from "../../../wrangler-shared/src/config";
import { confirm } from "../dialogs";
import { logger } from "../logger";
import { deleteIndex } from "./client";
import { deprecatedV1DefaultFlag, vectorizeGABanner } from "./common";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";

export function options(yargs: CommonYargsArgv) {
	return yargs
		.positional("name", {
			type: "string",
			demandOption: true,
			description: "The name of the Vectorize index",
		})
		.option("force", {
			describe: "Skip confirmation",
			type: "boolean",
			alias: "y",
			default: false,
		})
		.option("deprecated-v1", {
			type: "boolean",
			default: deprecatedV1DefaultFlag,
			describe: "Delete a deprecated Vectorize V1 index.",
		})
		.epilogue(vectorizeGABanner);
}

export async function handler(
	args: StrictYargsOptionsToInterface<typeof options>
) {
	const config = readConfig(args);

	logger.log(`Deleting Vectorize index ${args.name}`);
	if (!args.force) {
		const confirmedDeletion = await confirm(
			`OK to delete the index '${args.name}'?`
		);
		if (!confirmedDeletion) {
			logger.log("Deletion cancelled.");
			return;
		}
	}

	await deleteIndex(config, args.name, args.deprecatedV1);
	logger.log(`✅ Deleted index ${args.name}`);
}
