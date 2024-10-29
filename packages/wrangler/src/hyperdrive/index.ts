import chalk from "chalk";
import { type Argv } from "yargs";
import { UserError } from "../errors";
import { handler as createHandler, options as createOptions } from "./create";
import { handler as deleteHandler, options as deleteOptions } from "./delete";
import { handler as getHandler, options as getOptions } from "./get";
import { handler as listHandler, options as listOptions } from "./list";
import { handler as updateHandler, options as updateOptions } from "./update";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";
import type {
	CachingOptions,
	NetworkOriginWithSecrets,
	OriginDatabaseWithSecrets,
	OriginWithSecrets,
	OriginWithSecretsPartial,
} from "./client";

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

export function getOriginFromArgs<
	PartialUpdate extends boolean,
	OriginConfig = PartialUpdate extends true
		? OriginWithSecretsPartial
		: OriginWithSecrets,
>(
	allowPartialOrigin: PartialUpdate,
	args: StrictYargsOptionsToInterface<typeof upsertOptions>
): PartialUpdate extends true ? OriginConfig | undefined : OriginConfig {
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
		} as OriginConfig;
	}

	if (!allowPartialOrigin) {
		if (!args.originScheme) {
			throw new UserError(
				"You must specify the database protocol as --origin-scheme - e.g. 'postgresql'"
			);
		} else if (!args.database) {
			throw new UserError("You must provide a database name");
		} else if (!args.originUser) {
			throw new UserError(
				"You must provide a username for the origin database"
			);
		} else if (!args.originPassword) {
			throw new UserError(
				"You must provide a password for the origin database"
			);
		}
	}

	const databaseConfig = {
		scheme: args.originScheme,
		database: args.database,
		user: args.originUser,
		password: args.originPassword,
	} as PartialUpdate extends true
		? Partial<OriginDatabaseWithSecrets>
		: OriginDatabaseWithSecrets;

	let networkOrigin: NetworkOriginWithSecrets | undefined;
	if (args.accessClientId || args.accessClientSecret) {
		if (!args.accessClientId || !args.accessClientSecret) {
			throw new UserError(
				"You must provide both an Access Client ID and Access Client Secret when configuring Hyperdrive-over-Access"
			);
		}

		if (!args.originHost || args.originHost == "") {
			throw new UserError(
				"You must provide an origin hostname for the database"
			);
		}

		networkOrigin = {
			access_client_id: args.accessClientId,
			access_client_secret: args.accessClientSecret,
			host: args.originHost,
		};
	} else if (args.originHost || args.originPort) {
		if (!args.originHost) {
			throw new UserError(
				"You must provide an origin hostname for the database"
			);
		}

		if (!args.originPort) {
			throw new UserError(
				"You must provide a nonzero origin port for the database"
			);
		}

		networkOrigin = {
			host: args.originHost,
			port: args.originPort,
		};
	}

	const origin = {
		...databaseConfig,
		...networkOrigin,
	};

	if (JSON.stringify(origin) === "{}") {
		return undefined as PartialUpdate extends true
			? OriginConfig | undefined
			: OriginConfig;
	} else {
		return origin as PartialUpdate extends true
			? OriginConfig | undefined
			: OriginConfig;
	}
}

export function getCacheOptionsFromArgs(
	args: StrictYargsOptionsToInterface<typeof upsertOptions>
): CachingOptions | undefined {
	const caching = {
		disabled: args.cachingDisabled,
		max_age: args.maxAge,
		stale_while_revalidate: args.swr,
	};

	if (JSON.stringify(caching) === "{}") {
		return undefined;
	} else {
		return caching;
	}
}
