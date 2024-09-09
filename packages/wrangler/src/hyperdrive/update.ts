import { readConfig } from "../config";
import { defineCommand } from "../core";
import { UserError } from "../errors";
import { logger } from "../logger";
import { patchConfig } from "./client";
import type { PatchHyperdriveBody } from "./client";

defineCommand({
	command: "wrangler hyperdrive update",

	metadata: {
		description: "Update a Hyperdrive config",
		status: "stable",
		owner: "Product: Hyperdrive",
	},

	args: {
		id: {
			type: "string",
			demandOption: true,
			description: "The ID of the Hyperdrive config",
		},
		name: { type: "string", describe: "Give your config a new name" },
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
			describe: "The password used to connect to the origin database",
		},
		"access-client-id": {
			type: "string",
			describe:
				"The Client ID of the Access token to use when connecting to the origin database",
			conflicts: ["origin-port"],
			implies: ["access-client-secret"],
		},
		"access-client-secret": {
			type: "string",
			describe:
				"The Client Secret of the Access token to use when connecting to the origin database",
			conflicts: ["origin-port"],
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
	},
	positionalArgs: ["id"],

	async handler(args) {
		// check if all or none of the required origin fields are set, since we don't allow partial updates of the origin
		const allOriginFieldsSet = requiredOriginOptions.every((field) =>
			isOptionSet(args, field)
		);
		const noOriginFieldSet = requiredOriginOptions.every(
			(field) => !isOptionSet(args, field)
		);

		if (!allOriginFieldsSet && !noOriginFieldSet) {
			throw new UserError(
				`When updating the origin, all of the following must be set: ${requiredOriginOptions
					.map((option) => camelToKebab(option))
					.join(", ")}`
			);
		}

		if (
			allOriginFieldsSet &&
			args.originPort === undefined &&
			args.accessClientId === undefined &&
			args.accessClientSecret === undefined
		) {
			throw new UserError(
				`When updating the origin, either the port or the Access Client ID and Secret must be set`
			);
		}

		const config = readConfig(args.config, args);

		logger.log(`🚧 Updating '${args.id}'`);

		const database: PatchHyperdriveBody = {};

		if (args.name !== undefined) {
			database.name = args.name;
		}

		if (allOriginFieldsSet) {
			if (args.accessClientId && args.accessClientSecret) {
				database.origin = {
					scheme: args.originScheme ?? "postgresql",
					host: args.originHost,
					database: args.database,
					user: args.originUser,
					password: args.originPassword,
					access_client_id: args.accessClientId,
					access_client_secret: args.accessClientSecret,
				};
			} else {
				database.origin = {
					scheme: args.originScheme ?? "postgresql",
					host: args.originHost,
					port: args.originPort,
					database: args.database,
					user: args.originUser,
					password: args.originPassword,
				};
			}
		}

		database.caching = {
			disabled: args.cachingDisabled,
			max_age: args.maxAge,
			stale_while_revalidate: args.swr,
		};

		const updated = await patchConfig(config, args.id, database);
		logger.log(
			`✅ Updated ${updated.id} Hyperdrive config\n`,
			JSON.stringify(updated, null, 2)
		);
	},
});

const requiredOriginOptions = [
	"originHost",
	"database",
	"originUser",
	"originPassword",
] as const;

// utility for displaying the yargs options to the user when displaying the "all or nothing" error message
function camelToKebab(str: string): string {
	return str.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

function isOptionSet<T extends object>(args: T, key: keyof T): boolean {
	return key in args && args[key] !== undefined;
}
