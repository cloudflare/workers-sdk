import { createCommand } from "../core/create-command";
import { logger } from "../logger";
import { patchConfig } from "./client";
import {
	getCacheOptionsFromArgs,
	getMtlsFromArgs,
	getOriginConnectionLimitFromArgs,
	getOriginFromArgs,
	upsertOptions,
} from ".";

export const hyperdriveUpdateCommand = createCommand({
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
		name: {
			type: "string",
			description: "Give your config a new name",
		},
		...upsertOptions(),
	},
	positionalArgs: ["id"],
	async handler(args, { config }) {
		const origin = getOriginFromArgs(true, args);

		logger.log(`🚧 Updating '${args.id}'`);
		const updated = await patchConfig(config, args.id, {
			name: args.name,
			origin,
			caching: getCacheOptionsFromArgs(args),
			mtls: getMtlsFromArgs(args, origin?.scheme),
			origin_connection_limit: getOriginConnectionLimitFromArgs(args),
		});
		logger.log(
			`✅ Updated ${updated.id} Hyperdrive config\n`,
			JSON.stringify(updated, null, 2)
		);
	},
});
