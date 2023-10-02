import { readConfig } from "../config";
import { confirm } from "../dialogs";
import { logger } from "../logger";
import { deleteIndex } from "./client";
import { vectorizeBetaWarning } from "./common";
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
		.epilogue(vectorizeBetaWarning);
}

export async function handler(
	args: StrictYargsOptionsToInterface<typeof options>
) {
	const config = readConfig(args.config, args);

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

	await deleteIndex(config, args.name);
	logger.log(`✅ Deleted index ${args.name}`);
}
