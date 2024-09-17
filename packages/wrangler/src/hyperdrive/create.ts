import { readConfig } from "../config";
import { UserError } from "../errors";
import { logger } from "../logger";
import { createConfig } from "./client";
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
				describe:
					"The connection string for the database you want Hyperdrive to connect to - ex: protocol://user:password@host:port/database",
			},
			host: {
				type: "string",
				describe: "The host of the origin database",
				conflicts: "connection-string",
			},
			port: {
				type: "number",
				describe: "The port number of the origin database",
				conflicts: [
					"connection-string",
					"access-client-id",
					"access-client-secret",
				],
			},
			scheme: {
				type: "string",
				describe:
					"The scheme used to connect to the origin database - e.g. postgresql or postgres",
				default: "postgresql",
			},
			database: {
				type: "string",
				describe: "The name of the database within the origin database",
				conflicts: "connection-string",
			},
			user: {
				type: "string",
				describe: "The username used to connect to the origin database",
				conflicts: "connection-string",
			},
			password: {
				type: "string",
				describe: "The password used to connect to the origin database",
				conflicts: "connection-string",
			},
			"access-client-id": {
				type: "string",
				describe:
					"The Client ID of the Access token to use when connecting to the origin database, must be set with a Client Access Secret",
				conflicts: ["connection-string", "port"],
				implies: ["access-client-secret"],
			},
			"access-client-secret": {
				type: "string",
				describe:
					"The Client Secret of the Access token to use when connecting to the origin database, must be set with a Client Access ID",
				conflicts: ["connection-string", "port"],
				implies: ["access-client-id"],
			},
			"caching-disabled": {
				type: "boolean",
				describe: "Disables the caching of SQL responses",
				default: false,
			},
			"max-age": {
				type: "number",
				describe:
					"Specifies max duration for which items should persist in the cache, cannot be set when caching is disabled",
			},
			swr: {
				type: "number",
				describe:
					"Indicates the number of seconds cache may serve the response after it becomes stale, cannot be set when caching is disabled",
			},
		});
}

export async function handler(
	args: StrictYargsOptionsToInterface<typeof options>
) {
	const config = readConfig(args.config, args);

	const url = args.connectionString
		? new URL(args.connectionString)
		: buildURLFromParts(
				args.host,
				args.port,
				args.scheme,
				args.user,
				args.password
			);

	if (
		url.port === "" &&
		(url.protocol == "postgresql:" || url.protocol == "postgres:")
	) {
		url.port = "5432";
	}

	if (url.protocol === "") {
		throw new UserError(
			"You must specify the database protocol - e.g. 'postgresql'."
		);
	} else if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
		throw new UserError(
			"Only PostgreSQL or PostgreSQL compatible databases are currently supported."
		);
	} else if (url.host === "") {
		throw new UserError(
			"You must provide a hostname or IP address in your connection string - e.g. 'user:password@database-hostname.example.com:5432/databasename"
		);
	} else if (url.port === "") {
		throw new UserError(
			"You must provide a port number - e.g. 'user:password@database.example.com:port/databasename"
		);
	} else if (
		(args.connectionString && url.pathname === "") ||
		args.database === ""
	) {
		throw new UserError(
			"You must provide a database name as the path component - e.g. example.com:port/postgres"
		);
	} else if (url.username === "") {
		throw new UserError(
			"You must provide a username - e.g. 'user:password@database.example.com:port/databasename'"
		);
	} else if (url.password === "") {
		throw new UserError(
			"You must provide a password - e.g. 'user:password@database.example.com:port/databasename' "
		);
	} else {
		logger.log(`🚧 Creating '${args.name}'`);

		// if access client ID and client secret supplied in args, use them to construct origin without a port
		const origin =
			args.accessClientId && args.accessClientSecret
				? {
						host: url.hostname + url.pathname,
						scheme: url.protocol.replace(":", ""),
						database: args.database,
						user: decodeURIComponent(url.username),
						password: decodeURIComponent(url.password),
						access_client_id: args.accessClientId,
						access_client_secret: args.accessClientSecret,
					}
				: {
						host: url.hostname,
						port: parseInt(url.port),
						scheme: url.protocol.replace(":", ""),
						// database will either be the value passed in the relevant yargs flag or is URL-decoded value from the url pathname
						database:
							args.connectionString !== ""
								? decodeURIComponent(url.pathname.replace("/", ""))
								: args.database,
						user: decodeURIComponent(url.username),
						password: decodeURIComponent(url.password),
					};
		const database = await createConfig(config, {
			name: args.name,
			origin,
			caching: {
				disabled: args.cachingDisabled,
				max_age: args.maxAge,
				stale_while_revalidate: args.swr,
			},
		});
		logger.log(
			`✅ Created new Hyperdrive config\n`,
			JSON.stringify(database, null, 2)
		);
	}
}

function buildURLFromParts(
	host: string | undefined,
	port: number | undefined,
	scheme: string,
	user: string | undefined,
	password: string | undefined
): URL {
	const url = new URL(`${scheme}://${host}`);

	if (port) {
		url.port = port.toString();
	}

	if (user) {
		url.username = user;
	}

	if (password) {
		url.password = password;
	}

	return url;
}
