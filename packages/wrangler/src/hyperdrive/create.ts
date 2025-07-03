import { handleResourceBindingAndConfigUpdate } from "../config/auto-update";
import { createCommand } from "../core/create-command";
import { logger } from "../logger";
import { createConfig } from "./client";
import { capitalizeScheme } from "./shared";
import {
	getCacheOptionsFromArgs,
	getMtlsFromArgs,
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
		"config-binding-name": {
			type: "string",
			description: "The binding name to use when updating wrangler.jsonc",
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
		});
		logger.log(
			`✅ Created new Hyperdrive ${capitalizeScheme(database.origin.scheme)} config: ${database.id}`
		);

		// Handle binding name and config update using unified utility
		await handleResourceBindingAndConfigUpdate(
			args,
			{ ...config, configPath: config.configPath },
			{
				type: "hyperdrive",
				id: database.id,
				name: database.name,
			}
		);
	},
});
