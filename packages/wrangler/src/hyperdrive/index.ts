import { UserError } from "@cloudflare/workers-utils";
import { createNamespace } from "../core/create-command";
import type {
	CachingOptions,
	Mtls,
	NetworkOriginWithSecrets,
	OriginDatabaseWithSecrets,
	OriginWithSecrets,
	OriginWithSecretsPartial,
} from "./client";
import type { hyperdriveCreateCommand } from "./create";
import type { hyperdriveUpdateCommand } from "./update";

export const hyperdriveNamespace = createNamespace({
	metadata: {
		description: "🚀 Manage Hyperdrive databases",
		status: "stable",
		owner: "Product: Hyperdrive",
		category: "Storage & databases",
	},
});

export const upsertOptions = (
	defaultOriginScheme: string | undefined = undefined
) =>
	({
		"connection-string": {
			type: "string",
			description:
				"The connection string for the database you want Hyperdrive to connect to - ex: protocol://user:password@host:port/database",
			group: "Configure using a connection string",
		},
		"origin-host": {
			alias: "host",
			type: "string",
			description: "The host of the origin database",
			conflicts: "connection-string",
			group:
				"Configure using individual parameters [conflicts with --connection-string]",
		},
		"origin-port": {
			alias: "port",
			type: "number",
			description: "The port number of the origin database",
			conflicts: [
				"connection-string",
				"access-client-id",
				"access-client-secret",
			],
			group:
				"Configure using individual parameters [conflicts with --connection-string]",
		},
		"origin-scheme": {
			alias: "scheme",
			type: "string",
			choices: ["postgres", "postgresql", "mysql"],
			description: "The scheme used to connect to the origin database",
			group:
				"Configure using individual parameters [conflicts with --connection-string]",
			default: defaultOriginScheme,
		},
		database: {
			type: "string",
			description: "The name of the database within the origin database",
			conflicts: "connection-string",
			group:
				"Configure using individual parameters [conflicts with --connection-string]",
		},
		"origin-user": {
			alias: "user",
			type: "string",
			description: "The username used to connect to the origin database",
			conflicts: "connection-string",
			group:
				"Configure using individual parameters [conflicts with --connection-string]",
		},
		"origin-password": {
			alias: "password",
			type: "string",
			description: "The password used to connect to the origin database",
			conflicts: "connection-string",
			group:
				"Configure using individual parameters [conflicts with --connection-string]",
		},
		"access-client-id": {
			type: "string",
			description:
				"The Client ID of the Access token to use when connecting to the origin database",
			conflicts: ["connection-string", "origin-port"],
			implies: ["access-client-secret"],
			group:
				"Hyperdrive over Access [conflicts with --connection-string, --origin-port]",
		},
		"access-client-secret": {
			type: "string",
			description:
				"The Client Secret of the Access token to use when connecting to the origin database",
			conflicts: ["connection-string", "origin-port"],
			group:
				"Hyperdrive over Access [conflicts with --connection-string, --origin-port]",
		},
		"caching-disabled": {
			type: "boolean",
			description: "Disables the caching of SQL responses",
			group: "Caching Options",
		},
		"max-age": {
			type: "number",
			description:
				"Specifies max duration for which items should persist in the cache, cannot be set when caching is disabled",
			group: "Caching Options",
		},
		swr: {
			type: "number",
			description:
				"Indicates the number of seconds cache may serve the response after it becomes stale, cannot be set when caching is disabled",
			group: "Caching Options",
		},
		"ca-certificate-id": {
			alias: "ca-certificate-uuid",
			type: "string",
			description:
				"Sets custom CA certificate when connecting to origin database. Must be valid UUID of already uploaded CA certificate.",
		},
		"mtls-certificate-id": {
			alias: "mtls-certificate-uuid",
			type: "string",
			description:
				"Sets custom mTLS client certificates when connecting to origin database. Must be valid UUID of already uploaded public/private key certificates.",
		},
		sslmode: {
			type: "string",
			choices: ["require", "verify-ca", "verify-full"],
			description: "Sets CA sslmode for connecting to database.",
		},
		"origin-connection-limit": {
			type: "number",
			description:
				"The (soft) maximum number of connections that Hyperdrive may establish to the origin database",
		},
	}) as const;

export function getOriginFromArgs<
	PartialUpdate extends boolean,
	OriginConfig = PartialUpdate extends true
		? OriginWithSecretsPartial
		: OriginWithSecrets,
>(
	allowPartialOrigin: PartialUpdate,
	args:
		| typeof hyperdriveCreateCommand.args
		| typeof hyperdriveUpdateCommand.args
): PartialUpdate extends true ? OriginConfig | undefined : OriginConfig {
	if (args.connectionString) {
		const url = new URL(args.connectionString);
		url.protocol = url.protocol.toLowerCase();

		if (
			url.port === "" &&
			(url.protocol == "postgresql:" || url.protocol == "postgres:")
		) {
			url.port = "5432";
		} else if (url.port === "" && url.protocol == "mysql:") {
			url.port = "3306";
		}

		if (url.protocol === "") {
			throw new UserError(
				"You must specify the database protocol - e.g. 'postgresql'/'mysql'."
			);
		} else if (
			!url.protocol.startsWith("postgresql") &&
			!url.protocol.startsWith("postgres") &&
			!url.protocol.startsWith("mysql")
		) {
			throw new UserError(
				"Only PostgreSQL-compatible or MySQL-compatible databases are currently supported."
			);
		} else if (url.host === "") {
			throw new UserError(
				"You must provide a hostname or IP address in your connection string - e.g. 'user:password@database-hostname.example.com:5432/databasename"
			);
		} else if (url.port === "") {
			throw new UserError(
				"You must provide a port number - e.g. 'user:password@database.example.com:port/databasename"
			);
		} else if (!url.pathname) {
			throw new UserError(
				"You must provide a database name as the path component - e.g. example.com:port/databasename"
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
	args:
		| typeof hyperdriveCreateCommand.args
		| typeof hyperdriveUpdateCommand.args
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

export function getMtlsFromArgs(
	args:
		| typeof hyperdriveCreateCommand.args
		| typeof hyperdriveUpdateCommand.args
): Mtls | undefined {
	const mtls = {
		ca_certificate_id: args.caCertificateId,
		mtls_certificate_id: args.mtlsCertificateId,
		sslmode: args.sslmode,
	};

	if (JSON.stringify(mtls) === "{}") {
		return undefined;
	} else {
		if (mtls.sslmode == "require" && mtls.ca_certificate_id?.trim()) {
			throw new UserError("CA not allowed when sslmode = 'require' is set");
		}

		if (
			(mtls.sslmode == "verify-ca" || mtls.sslmode == "verify-full") &&
			!mtls.ca_certificate_id?.trim()
		) {
			throw new UserError(
				"CA required when sslmode = 'verify-ca' or 'verify-full' is set"
			);
		}
		return mtls;
	}
}

export function getOriginConnectionLimitFromArgs(
	args:
		| typeof hyperdriveCreateCommand.args
		| typeof hyperdriveUpdateCommand.args
): number | undefined {
	return args.originConnectionLimit;
}
