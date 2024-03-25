import { readConfig } from "../config";
import { logger } from "../logger";
import { patchConfig } from "./client";
import { hyperdriveBetaWarning } from "./utils";
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
		.epilogue(hyperdriveBetaWarning);
}

const requiredOriginOptions = [
	"origin-host",
	"origin-port",
	"database",
	"origin-user",
	"origin-password",
];

function isOptionSet<T extends object>(args: T, key: keyof T): boolean {
	return key in args && args[key] !== undefined;
}

export async function handler(
	args: StrictYargsOptionsToInterface<typeof options>
) {
	// check if all or none of the required origin fields are set, since we don't allow partial updates of the origin
	const allOriginFieldsSet = requiredOriginOptions.every((field) =>
		isOptionSet(args, field as keyof typeof options)
	);
	const noOriginFieldSet = requiredOriginOptions.every(
		(field) => !isOptionSet(args, field as keyof typeof options)
	);

	if (!allOriginFieldsSet && !noOriginFieldSet) {
		throw new Error(
			`When updating the origin, all of the following must be set: ${requiredOriginOptions.join(
				", "
			)}`
		);
	}

	const config = readConfig(args.config, args);

	logger.log(`🚧 Updating '${args.id}'`);

	const database: PatchHyperdriveBody = {};

	if (args.name !== undefined) {
		database.name = args.name;
	}

	if (allOriginFieldsSet) {
		database.origin = {
			host: args.originHost,
			port: args.originPort,
			database: args.database,
			user: args.originUser,
			password: args.originPassword,
		};
		if (args.originScheme !== undefined) {
			database.origin.scheme = args.originScheme;
		} else {
			database.origin.scheme = "postgresql"; // setting default if not passed
		}
	}

	if (args.cachingDisabled || args.maxAge || args.swr) {
		database.caching = {
			disabled: args.cachingDisabled,
			maxAge: args.maxAge,
			staleWhileRevalidate: args.swr,
		};
	}

	const updated = await patchConfig(config, args.id, database);
	logger.log(
		`✅ Updated ${updated.id} Hyperdrive config\n`,
		JSON.stringify(updated, null, 2)
	);
}
