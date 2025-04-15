import { configFileName, formatConfigSnippet } from "../config";
import { createCommand } from "../core/create-command";
import { logger } from "../logger";
import { createConfig } from "./client";
import { capitalizeScheme } from "./shared";
import { getCacheOptionsFromArgs, getMtlsFromArgs, getOriginFromArgs } from ".";

export const hyperdriveCreateCommand = createCommand({
	metadata: {
		description: "Create a Hyperdrive config",
		status: "open-beta",
		owner: "Product: Hyperdrive",
	},
	args: {
		name: {
			type: "string",
			demandOption: true,
			description: "The name of the Hyperdrive config",
		},
		"connection-string": {
			type: "string",
			description:
				"The connection string for the database you want Hyperdrive to connect to - ex: protocol://user:password@host:port/database",
		},
		"origin-host": {
			alias: "host",
			type: "string",
			description: "The host of the origin database",
			conflicts: "connection-string",
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
		},
		"origin-scheme": {
			alias: "scheme",
			type: "string",
			choices: ["postgres", "postgresql", "mysql"],
			description: "The scheme used to connect to the origin database",
			default: "postgresql",
		},
		database: {
			type: "string",
			description: "The name of the database within the origin database",
			conflicts: "connection-string",
		},
		"origin-user": {
			alias: "user",
			type: "string",
			description: "The username used to connect to the origin database",
			conflicts: "connection-string",
		},
		"origin-password": {
			alias: "password",
			type: "string",
			description: "The password used to connect to the origin database",
			conflicts: "connection-string",
		},
		"access-client-id": {
			type: "string",
			description:
				"The Client ID of the Access token to use when connecting to the origin database",
			conflicts: ["connection-string", "origin-port"],
			implies: ["access-client-secret"],
		},
		"access-client-secret": {
			type: "string",
			description:
				"The Client Secret of the Access token to use when connecting to the origin database",
			conflicts: ["connection-string", "origin-port"],
		},
		"caching-disabled": {
			type: "boolean",
			description: "Disables the caching of SQL responses",
		},
		"max-age": {
			type: "number",
			description:
				"Specifies max duration for which items should persist in the cache, cannot be set when caching is disabled",
		},
		swr: {
			type: "number",
			description:
				"Indicates the number of seconds cache may serve the response after it becomes stale, cannot be set when caching is disabled",
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
	},
	positionalArgs: ["name"],
	async handler(args, { config }) {
		const origin = getOriginFromArgs(false, args);

		logger.log(`🚧 Creating '${args.name}'`);
		const database = await createConfig(config, {
			name: args.name,
			origin,
			caching: getCacheOptionsFromArgs(args),
			mtls: getMtlsFromArgs(args),
		});
		logger.log(
			`✅ Created new Hyperdrive ${capitalizeScheme(database.origin.scheme)} config: ${database.id}`
		);
		logger.log(
			`📋 To start using your config from a Worker, add the following binding configuration to your ${configFileName(config.configPath)} file:\n`
		);
		logger.log(
			formatConfigSnippet(
				{
					hyperdrive: [{ binding: "HYPERDRIVE", id: database.id }],
				},
				config.configPath
			)
		);
	},
});
