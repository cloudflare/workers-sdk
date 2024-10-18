import chalk from "chalk";
import type { Argv } from "yargs";
import { UserError } from "../errors";
import type {
	CachingOptions,
	OriginCommonWithSecrets,
	OriginHostAndPortWithSecrets,
	OriginWithSecrets,
} from "./client";
import { handler as createHandler, options as createOptions } from "./create";
import { handler as deleteHandler, options as deleteOptions } from "./delete";
import { handler as getHandler, options as getOptions } from "./get";
import { handler as listHandler, options as listOptions } from "./list";
import { handler as updateHandler, options as updateOptions } from "./update";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";

export function hyperdrive(yargs: CommonYargsArgv) {
	return yargs
		.command(
			"create <name>",
			"Create a Hyperdrive config",
			createOptions,
			createHandler
		)
		.command(
			"delete <id>",
			"Delete a Hyperdrive config",
			deleteOptions,
			deleteHandler
		)
		.command("get <id>", "Get a Hyperdrive config", getOptions, getHandler)
		.command("list", "List Hyperdrive configs", listOptions, listHandler)
		.command(
			"update <id>",
			"Update a Hyperdrive config",
			updateOptions,
			updateHandler
		);
}

export function upsertOptions<T>(yargs: Argv<T>) {
	return yargs
		.option({
			"connection-string": {
				type: "string",
				describe:
					"The connection string for the database you want Hyperdrive to connect to - ex: protocol://user:password@host:port/database",
			},
			"origin-host": {
				alias: "host",
				type: "string",
				describe: "The host of the origin database",
				conflicts: "connection-string",
			},
			"origin-port": {
				alias: "port",
				type: "number",
				describe: "The port number of the origin database",
				conflicts: [
					"connection-string",
					"access-client-id",
					"access-client-secret",
				],
			},
			"origin-scheme": {
				alias: "scheme",
				type: "string",
				choices: ["postgres", "postgresql"],
				describe: "The scheme used to connect to the origin database",
				default: "postgresql",
			},
			database: {
				type: "string",
				describe: "The name of the database within the origin database",
				conflicts: "connection-string",
			},
			"origin-user": {
				alias: "user",
				type: "string",
				describe: "The username used to connect to the origin database",
				conflicts: "connection-string",
			},
			"origin-password": {
				alias: "password",
				type: "string",
				describe: "The password used to connect to the origin database",
				conflicts: "connection-string",
			},
			"access-client-id": {
				type: "string",
				describe:
					"The Client ID of the Access token to use when connecting to the origin database",
				conflicts: ["connection-string", "origin-port"],
				implies: ["access-client-secret"],
			},
			"access-client-secret": {
				type: "string",
				describe:
					"The Client Secret of the Access token to use when connecting to the origin database",
				conflicts: ["connection-string", "origin-port"],
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
		})
		.group(
			["connection-string"],
			`${chalk.bold("Configure using a connection string")}`
		)
		.group(
			[
				"name",
				"origin-host",
				"origin-port",
				"scheme",
				"database",
				"origin-user",
				"origin-password",
			],
			`${chalk.bold("Configure using individual parameters [conflicts with --connection-string]")}`
		)
		.group(
			["access-client-id", "access-client-secret"],
			`${chalk.bold("Hyperdrive over Access [conflicts with --connection-string, --origin-port]")}`
		)
		.group(
			["caching-disabled", "max-age", "swr"],
			`${chalk.bold("Caching Options")}`
		);
}

export function getOriginFromArgs(
	args: StrictYargsOptionsToInterface<typeof upsertOptions>
): OriginWithSecrets | undefined {
	if (args.connectionString) {
		const url = new URL(args.connectionString);

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
		} else if (url.pathname === "") {
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
		}

		return {
			host: url.hostname,
			port: parseInt(url.port),
			scheme: url.protocol.replace(":", ""),
			database: decodeURIComponent(url.pathname.replace("/", "")),
			user: decodeURIComponent(url.username),
			password: decodeURIComponent(url.password),
		} as OriginHostAndPortWithSecrets;
	} else if (args.originHost) {
		if (!args.database || args.database === "") {
			throw new UserError("You must provide a database name");
		} else if (!args.originUser || args.originUser === "") {
			throw new UserError(
				"You must provide a username for the origin database"
			);
		} else if (!args.originPassword || args.originPassword === "") {
			throw new UserError(
				"You must provide a password for the origin database"
			);
		}

		const common: OriginCommonWithSecrets = {
			scheme: args.originScheme,
			host: args.originHost,
			database: args.database,
			user: args.originUser,
			password: args.originPassword,
		};

		if (args.accessClientId || args.accessClientSecret) {
			if (
				!args.accessClientId ||
				args.accessClientId === "" ||
				!args.accessClientSecret ||
				args.accessClientSecret === ""
			) {
				throw new UserError(
					"You must provide both an Access Client ID and Access Client Secret when configuring Hyperdrive-over-Access"
				);
			}

			return {
				access_client_id: args.accessClientId,
				access_client_secret: args.accessClientSecret,
				...common,
			};
		} else {
			if (!args.originPort) {
				throw new UserError("You must provide a port for the origin database");
			}

			return {
				port: args.originPort,
				...common,
			};
		}
	} else {
		// this must be a patch that is changing other settings, return undefined

		return undefined;
	}
}

export function getCacheOptionsFromArgs(
	args: StrictYargsOptionsToInterface<typeof upsertOptions>
): CachingOptions {
	return {
		disabled: args.cachingDisabled,
		max_age: args.maxAge,
		stale_while_revalidate: args.swr,
	};
}
