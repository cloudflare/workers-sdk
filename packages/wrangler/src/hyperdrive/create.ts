import { createCommand } from "../core/create-command";
import { logger } from "../logger";
import { createdResourceConfig } from "../utils/add-created-resource-config";
import { getValidBindingName } from "../utils/getValidBindingName";
import { createConfig } from "./client";
import { capitalizeScheme } from "./shared";
import {
	getCacheOptionsFromArgs,
	getMtlsFromArgs,
	getOriginConnectionLimitFromArgs,
	getOriginFromArgs,
	upsertOptions,
} from ".";

export const hyperdriveCreateCommand = createCommand({
	metadata: {
		description: "Create a Hyperdrive config",
		status: "stable",
		owner: "Product: Hyperdrive",
	},
	args: {
		name: {
			type: "string",
			demandOption: true,
			description: "The name of the Hyperdrive config",
		},
		...upsertOptions("postgresql"),
		binding: {
			type: "string",
			description: "The binding name of this resource in your Worker",
		},
		"use-remote": {
			type: "boolean",
			description:
				"Use a remote binding when adding the newly created resource to your config",
		},
		"update-config": {
			type: "boolean",
			description:
				"Automatically update your config file with the newly added resource",
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
			origin_connection_limit: getOriginConnectionLimitFromArgs(args),
		});
		logger.log(
			`✅ Created new Hyperdrive ${capitalizeScheme(database.origin.scheme)} config: ${database.id}`
		);

		await createdResourceConfig(
			"hyperdrive",
			(name) => ({
				binding: getValidBindingName(name ?? "HYPERDRIVE", "HYPERDRIVE"),
				id: database.id,
			}),
			config.configPath,
			args.env,
			args
		);
	},
});
