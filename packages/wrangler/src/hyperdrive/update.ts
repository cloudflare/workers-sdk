import { readConfig } from "../config";
import { UserError } from "../errors";
import { logger } from "../logger";
import { patchConfig } from "./client";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";
import type { PatchHyperdriveBody } from "./client";

export function options(yargs: CommonYargsArgv) {
	return yargs
		.positional("id", {
			type: "string",
			demandOption: true,
			description: "The ID of the Hyperdrive config",
		})
		.options({
			name: { type: "string", describe: "Give your config a new name" },
			"origin-host": {
				type: "string",
				describe: "The host of the origin database",
				implies: ["database", "origin-user", "origin-password"],
			},
			"origin-port": {
				type: "number",
				describe: "The port number of the origin database",
				implies: ["origin-host", "database", "origin-user", "origin-password"],
			},
			"origin-scheme": {
				type: "string",
				describe:
					"The scheme used to connect to the origin database - e.g. postgresql or postgres",
			},
			database: {
				type: "string",
				describe: "The name of the database within the origin database",
				implies: ["origin-host", "origin-user", "origin-password"],
			},
			"origin-user": {
				type: "string",
				describe: "The username used to connect to the origin database",
				implies: ["origin-host", "database", "origin-password"],
			},
			"origin-password": {
				type: "string",
				describe: "The password used to connect to the origin database",
				implies: ["origin-host", "database", "origin-user"],
			},
			"access-client-id": {
				type: "string",
				describe:
					"The Client ID of the Access token to use when connecting to the origin database",
				conflicts: ["origin-port"],
				implies: [
					"access-client-secret",
					"origin-host",
					"database",
					"origin-user",
					"origin-password",
				],
			},
			"access-client-secret": {
				type: "string",
				describe:
					"The Client Secret of the Access token to use when connecting to the origin database",
				conflicts: ["origin-port"],
				implies: [
					"access-client-id",
					"origin-host",
					"database",
					"origin-user",
					"origin-password",
				],
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

const coreOriginOptions = [
	"originHost",
	"database",
	"originUser",
	"originPassword",
] as const;

function isOptionSet<T extends object>(args: T, key: keyof T): boolean {
	return key in args && args[key] !== undefined;
}

export async function handler(
	args: StrictYargsOptionsToInterface<typeof options>
) {
	// check if all or none of the required origin fields are set, since we don't allow partial updates of the origin
	const coreOriginFieldsSet = coreOriginOptions.every((field) =>
		isOptionSet(args, field)
	);

	if (
		coreOriginFieldsSet &&
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

	if (coreOriginFieldsSet) {
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
}
