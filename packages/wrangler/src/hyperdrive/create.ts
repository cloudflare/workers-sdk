import { configFileName, formatConfigSnippet } from "../config";
import { createCommand } from "../core/create-command";
import { confirm } from "../dialogs";
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
		...upsertOptions("postgresql"),
	},
	positionalArgs: ["name"],
	async handler(args, { config }) {
		const origin = getOriginFromArgs(false, args);
		const mtls = getMtlsFromArgs(args);

		// Check if caching options were provided via CLI args
		let caching = getCacheOptionsFromArgs(args);

		// If no caching options provided, prompt the user
		if (!caching) {
			const enableCaching = await confirm(
				"Do you want to enable caching for this Hyperdrive? This can improve performance by caching SQL responses (default 60s).",
				{ defaultValue: true, fallbackValue: true }
			);

			if (!enableCaching) {
				caching = { disabled: true };
			}
			// If enableCaching is true, leave caching as undefined to use default API behavior
		}

		logger.log(`🚧 Creating '${args.name}'`);
		const database = await createConfig(config, {
			name: args.name,
			origin,
			caching,
			mtls,
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
