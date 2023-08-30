import { readConfig } from "../config";
import { logger } from "../logger";
import { listDatabases } from "./client";
import { hyperdriveBetaWarning } from "./common";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";

export function options(yargs: CommonYargsArgv) {
	return yargs.epilogue(hyperdriveBetaWarning);
}

export async function handler(
	args: StrictYargsOptionsToInterface<typeof options>
) {
	const config = readConfig(args.config, args);

	logger.log(`📋 Listing Hyperdrive databases`);
	const databases = await listDatabases(config);
	logger.table(
		databases.map((database) => ({
			id: database.id,
			name: database.name,
			user: database.origin.user ?? "",
			host: database.origin.host ?? "",
			port: database.origin.port?.toString() ?? "",
			database: database.origin.database ?? "",
		}))
	);
}
