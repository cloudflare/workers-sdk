import { readConfig } from "../config";
import { logger } from "../logger";
import { createDatabase } from "./client";
import { hyperdriveBetaWarning } from "./common";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";

export function options(yargs: CommonYargsArgv) {
	return yargs
		.positional("name", {
			type: "string",
			demandOption: true,
			description: "The name of the Hyperdrive configuration",
		})
		.options({
			"connection-string": {
				type: "string",
				demandOption: true,
				describe:
					"The connection string used for the database connection, ex: protocol://user:password@host:port/database",
			},
		})
		.epilogue(hyperdriveBetaWarning);
}

export async function handler(
	args: StrictYargsOptionsToInterface<typeof options>
) {
	const config = readConfig(args.config, args);

	const url = new URL(args.connectionString);

	if (
		url &&
		url.hostname &&
		url.port &&
		url.pathname &&
		url.username &&
		url.password
	) {
		logger.log(`🚧 Creating '${args.name}'`);
		const database = await createDatabase(config, {
			name: args.name,
			origin: {
				host: url.hostname,
				port: parseInt(url.port),
				database: url.pathname.replace("/", ""),
				user: url.username,
				password: url.password,
			},
		});
		logger.log(
			`✅ Created new Hyperdrive configuration\n`,
			JSON.stringify(database, null, 2)
		);
	} else {
		logger.log(`❌ Invalid or incomplete database connection string`);
	}
}
