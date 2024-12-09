import { readConfig } from "../config";
import { logger } from "../logger";
import { deleteConfig } from "./client";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";

export function options(yargs: CommonYargsArgv) {
	return yargs.positional("id", {
		type: "string",
		demandOption: true,
		description: "The ID of the Hyperdrive config",
	});
}

export async function handler(
	args: StrictYargsOptionsToInterface<typeof options>
) {
	const config = readConfig(args);

	logger.log(`🗑️ Deleting Hyperdrive database config ${args.id}`);
	await deleteConfig(config, args.id);
	logger.log(`✅ Deleted`);
}
