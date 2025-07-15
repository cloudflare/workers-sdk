import { configFileName, formatConfigSnippet } from "../config";
import { createCommand } from "../core/create-command";
import { logger } from "../logger";
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
