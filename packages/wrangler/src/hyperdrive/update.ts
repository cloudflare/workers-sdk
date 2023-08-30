import { readConfig } from "../config";
import { logger } from "../logger";
import { getDatabase, updateDatabase } from "./client";
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
			description: "The ID of the Hyperdrive configuration",
		})
		.options({
			"origin-host": {
				type: "string",
				describe: "",
			},
			"origin-port": {
				type: "number",
				describe: "",
			},
			database: {
				type: "string",
			},
			"origin-user": {
				type: "string",
			},
			"origin-password": {
				type: "string",
			},
		})
		.epilogue(hyperdriveBetaWarning);
}

export async function handler(
	args: StrictYargsOptionsToInterface<typeof options>
) {
	const config = readConfig(args.config, args);

	logger.log(`🚧 Updating '${args.id}'`);
	const database = (await getDatabase(
		config,
		args.id
	)) as CreateUpdateHyperdriveBody;
	if (args.originHost) {
		database.origin.host = args.originHost;
	}
	if (args.originPort) {
		database.origin.port = args.originPort;
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

	const updated = await updateDatabase(config, args.id, database);
	logger.log(
		`✅ Updated ${updated.id} Hyperdrive configuration\n`,
		JSON.stringify(updated, null, 2)
	);
}
