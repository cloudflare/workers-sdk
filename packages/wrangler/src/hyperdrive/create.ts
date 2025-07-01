import { configFileName } from "../config";
import { updateWranglerConfigOrDisplaySnippet } from "../config/auto-update";
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
		"update-config": {
			type: "boolean",
			default: false,
			description: "Automatically update wrangler.jsonc with the new hyperdrive binding without prompting",
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

		// Auto-update wrangler config or show snippet
		await updateWranglerConfigOrDisplaySnippet(
			{
				type: "hyperdrive",
				id: database.id,
				name: database.name,
				binding: "HYPERDRIVE",
			},
			config.configPath,
			args.updateConfig,
			`📋 To start using your config from a Worker, add the following binding configuration to your ${configFileName(config.configPath)} file:\n`
		);
	},
});
