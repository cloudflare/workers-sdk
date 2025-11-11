import { createCommand } from "../core/create-command";
import { confirm } from "../dialogs";
import { isNonInteractiveOrCI } from "../is-interactive";
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
		const mtls = getMtlsFromArgs(args);
    const origin_connection_limit = getOriginConnectionLimitFromArgs(args);

		// Check if caching options were provided via CLI args
		let caching = getCacheOptionsFromArgs(args);

		// If no caching options provided, prompt the user (or use default in non-interactive environments)
		if (!caching) {
			if (isNonInteractiveOrCI()) {
				// In non-interactive environments, use the default behavior (caching enabled)
				// Leave caching as undefined to use default API behavior
			} else {
				const enableCaching = await confirm(
					"Do you want to enable caching for this Hyperdrive? This can improve performance by caching SQL responses (default 60s).",
					{ defaultValue: true, fallbackValue: true }
				);

				if (!enableCaching) {
					caching = { disabled: true };
				}
				// If enableCaching is true, leave caching as undefined to use default API behavior
			}
		}

		logger.log(`🚧 Creating '${args.name}'`);
		const database = await createConfig(config, {
			name: args.name,
			origin,
			caching,
			mtls,
			origin_connection_limit
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
