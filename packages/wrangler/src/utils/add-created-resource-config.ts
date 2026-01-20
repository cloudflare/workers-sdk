import {
	configFormat,
	experimental_patchConfig,
	formatConfigSnippet,
	friendlyBindingNames,
	JSON_CONFIG_FORMATS,
} from "@cloudflare/workers-utils";
import { confirm, prompt } from "../dialogs";
import { logger } from "../logger";
import type {
	CfWorkerInit,
	Config,
	RawConfig,
} from "@cloudflare/workers-utils";

// All config keys that follow a "regular" binding shape (Binding[]) and so can be modified using `updateConfigFile`.
type ValidKeys = Exclude<
	keyof CfWorkerInit["bindings"],
	| "ai"
	| "browser"
	| "vars"
	| "wasm_modules"
	| "text_blobs"
	| "data_blobs"
	| "logfwdr"
	| "queues"
	| "assets"
	| "durable_objects"
	| "version_metadata"
	| "images"
	| "media"
	| "unsafe"
	| "ratelimits"
	| "workflows"
	| "send_email"
	| "services"
	| "analytics_engine_datasets"
	| "mtls_certificates"
	| "dispatch_namespaces"
	| "secrets_store_secrets"
	| "unsafe_hello_world"
>;

export const sharedResourceCreationArgs = {
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
	binding: {
		type: "string",
		description: "The binding name of this resource in your Worker",
	},
} as const;

export async function createdResourceConfig<K extends ValidKeys>(
	resource: K,
	snippet: (bindingName?: string) => Partial<NonNullable<RawConfig[K]>[number]>,
	configPath: Config["configPath"],
	env: string | undefined,
	/**
	 * How should this behave interactively?
	 *
	 * - If `updateConfig` is provided, Wrangler won't ask for permission to write to your config file
	 * - `binding` sets the value of the binding name in the config file, and/or the value of the binding name in the echoed output. It also implies `updateConfig`
	 * - `useRemote` sets the value of the `remote` field in the config file, and/or the value of the `remote` field in the echoed output
	 */
	defaults?: {
		binding?: string;
		useRemote?: boolean;
		updateConfig?: boolean;
	}
) {
	const envString = env ? ` in the "${env}" environment` : "";
	logger.log(
		`To access your new ${friendlyBindingNames[resource]} in your Worker, add the following snippet to your configuration file${envString}:`
	);

	logger.log(
		formatConfigSnippet(
			{
				[resource]: [
					{
						...snippet(defaults?.binding),
						...(defaults?.useRemote === true ? { remote: true } : {}),
					},
				],
			},
			configPath
		)
	);

	// This is a JSON config file that we're capable of editing
	const format = configFormat(configPath);
	if (configPath && JSON_CONFIG_FORMATS.includes(format)) {
		const writeToConfig =
			defaults?.binding ??
			defaults?.updateConfig ??
			(await confirm("Would you like Wrangler to add it on your behalf?", {
				defaultValue: true,
				// We don't want to automatically write to config in CI
				fallbackValue: false,
			}));

		if (writeToConfig) {
			const bindingName =
				defaults?.binding ??
				(await prompt("What binding name would you like to use?", {
					defaultValue: snippet().binding,
				}));

			const useRemote =
				defaults?.useRemote ??
				(defaults?.binding || defaults?.updateConfig
					? false
					: await confirm(
							"For local dev, do you want to connect to the remote resource instead of a local resource?",
							{ defaultValue: false }
						));

			const configFilePatch = {
				[resource]: [
					{ ...snippet(bindingName), ...(useRemote ? { remote: true } : {}) },
				],
			};

			experimental_patchConfig(
				configPath,
				env ? { env: { [env]: configFilePatch } } : configFilePatch,
				true
			);
		}
	}
}
