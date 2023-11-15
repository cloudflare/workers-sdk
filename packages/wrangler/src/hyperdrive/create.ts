import { readConfig } from "../config";
import { logger } from "../logger";
import { createConfig } from "./client";
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
			description: "The name of the Hyperdrive config",
		})
		.options({
			"connection-string": {
				type: "string",
				demandOption: true,
				describe:
					"The connection string for the database you want Hyperdrive to connect to - ex: protocol://user:password@host:port/database",
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

	const url = new URL(args.connectionString);

	if (
		url.port === "" &&
		(url.protocol == "postgresql:" || url.protocol == "postgres:")
	) {
		url.port = "5432";
	}

	if (url.protocol === "") {
		logger.log("You must specify the database protocol - e.g. 'postgresql'.");
	} else if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
		logger.log(
			"Only PostgreSQL or PostgreSQL compatible databases are currently supported."
		);
	} else if (url.host === "") {
		logger.log(
			"You must provide a hostname or IP address in your connection string - e.g. 'user:password@database-hostname.example.com:5432/databasename"
		);
	} else if (url.port === "") {
		logger.log(
			"You must provide a port number - e.g. 'user:password@database.example.com:port/databasename"
		);
	} else if (url.pathname === "") {
		logger.log(
			"You must provide a database name as the path component - e.g. /postgres"
		);
	} else if (url.username === "") {
		logger.log(
			"You must provide a username - e.g. 'user:password@database.example.com:port/databasename'"
		);
	} else if (url.password === "") {
		logger.log(
			"You must provide a password - e.g. 'user:password@database.example.com:port/databasename' "
		);
	} else {
		logger.log(`🚧 Creating '${args.name}'`);
		const database = await createConfig(config, {
			name: args.name,
			origin: {
				host: url.hostname,
				port: parseInt(url.port),
				scheme: url.protocol.replace(":", ""),
				database: url.pathname.replace("/", ""),
				user: url.username,
				password: url.password,
			},
			caching: { disabled: args.cachingDisabled ?? false },
		});
		logger.log(
			`✅ Created new Hyperdrive config\n`,
			JSON.stringify(database, null, 2)
		);
	}
}
