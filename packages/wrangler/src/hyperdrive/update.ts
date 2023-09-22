import { readConfig } from "../config";
import { logger } from "../logger";
import { getConfig, updateConfig } from "./client";
import { hyperdriveBetaWarning } from "./common";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";
import type { CreateUpdateHyperdriveBody } from "./client";

export function options(yargs: CommonYargsArgv) {
	return yargs
		.positional("id", {
			type: "string",
			demandOption: true,
			description: "The ID of the Hyperdrive config",
		})
		.options({
			"origin-host": {
				type: "string",
				describe: "The host of the origin database",
			},
			"origin-port": {
				type: "number",
				describe: "The port number of the origin database",
			},
			"origin-scheme": {
				type: "string",
				describe:
					"The scheme used to connect to the origin database - e.g. postgresql or postgres",
			},
			database: {
				type: "string",
				describe: "The name of the database within the origin database",
			},
			"origin-user": {
				type: "string",
				describe: "The username used to connect to the origin database",
			},
			"origin-password": {
				type: "string",
				demandOption: true,
				describe: "The password used to connect to the origin database",
			},
			"caching-disabled": {
				type: "boolean",
				describe:
					"Whether caching query results is disabled for this Hyperdrive config",
			},
		})
		.epilogue(hyperdriveBetaWarning);
}

export async function handler(
	args: StrictYargsOptionsToInterface<typeof options>
) {
	const config = readConfig(args.config, args);

	logger.log(`🚧 Updating '${args.id}'`);
	const database = (await getConfig(
		config,
		args.id
	)) as CreateUpdateHyperdriveBody;
	if (args.originHost) {
		database.origin.host = args.originHost;
	}
	if (args.originPort) {
		database.origin.port = args.originPort;
	}
	if (args.originScheme) {
		database.origin.scheme = args.originScheme;
	} else if (!database.origin.scheme) {
		database.origin.scheme = "postgresql";
	}
	if (args.database) {
		database.origin.database = args.database;
	}
	if (args.originUser) {
		database.origin.user = args.originUser;
	}
	if (args.originPassword) {
		database.origin.password = args.originPassword;
	}
	if (args.cachingDisabled !== undefined) {
		database.caching.disabled = args.cachingDisabled;
	}
	const updated = await updateConfig(config, args.id, database);
	logger.log(
		`✅ Updated ${updated.id} Hyperdrive config\n`,
		JSON.stringify(updated, null, 2)
	);
}
