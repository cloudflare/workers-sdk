import { readConfig } from "../../../wrangler-shared/src/config";
import { logger } from "../logger";
import { getConfig } from "./client";
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

	const database = await getConfig(config, args.id);
	logger.log(JSON.stringify(database, null, 2));
}
