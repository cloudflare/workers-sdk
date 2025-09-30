import TOML from "@iarna/toml";
import { confirm, prompt } from "../dialogs";
import { FatalError, UserError } from "../errors";
import { logger } from "../logger";
import { EXIT_CODE_INVALID_PAGES_CONFIG } from "../pages/errors";
import { parseJSONC, parseTOML, readFileSync } from "../parse";
import { friendlyBindingNames } from "../utils/print-bindings";
import { resolveWranglerConfigPath } from "./config-helpers";
import { experimental_patchConfig } from "./patch-config";
import { isPagesConfig, normalizeAndValidateConfig } from "./validation";
import { validatePagesConfig } from "./validation-pages";
import type { CfWorkerInit } from "../deployment-bundle/worker";
import type { CommonYargsOptions } from "../yargs-types";
import type { Config, OnlyCamelCase, RawConfig } from "./config";
import type { ResolveConfigPathOptions } from "./config-helpers";
import type { NormalizeAndValidateConfigArgs } from "./validation";

export type {
	Config,
	ConfigFields,
	DevConfig,
	RawConfig,
	RawDevConfig,
} from "./config";
export type {
	ConfigModuleRuleType,
	Environment,
	RawEnvironment,
} from "./environment";

export function configFormat(
	configPath: string | undefined
): "jsonc" | "toml" | "none" {
	if (configPath?.endsWith("toml")) {
		return "toml";
	} else if (configPath?.endsWith("json") || configPath?.endsWith("jsonc")) {
		return "jsonc";
	}
	return "none";
}

export function configFileName(configPath: string | undefined) {
	const format = configFormat(configPath);
	if (format === "toml") {
		return "wrangler.toml";
	} else if (format === "jsonc") {
		return "wrangler.json";
	} else {
		return "Wrangler configuration";
	}
}

export function formatConfigSnippet(
	snippet: RawConfig,
	configPath: Config["configPath"],
	formatted = true
) {
	const format = configFormat(configPath);
	if (format === "toml") {
		return TOML.stringify(snippet as TOML.JsonMap);
	} else {
		return formatted
			? JSON.stringify(snippet, null, 2)
			: JSON.stringify(snippet);
	}
}

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

export async function updateConfigFile<K extends ValidKeys>(
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

	// This is a JSONC config file that we're capable of editing
	if (configPath && configFormat(configPath) === "jsonc") {
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

export type ReadConfigCommandArgs = NormalizeAndValidateConfigArgs & {
	config?: string;
	script?: string;
};

export type ReadConfigOptions = ResolveConfigPathOptions & {
	hideWarnings?: boolean;
	// Used by the Vite plugin
	// If set to `true`, the `main` field is not converted to an absolute path
	preserveOriginalMain?: boolean;
};

export type ConfigBindingOptions = Pick<
	Config,
	| "ai"
	| "browser"
	| "d1_databases"
	| "dispatch_namespaces"
	| "durable_objects"
	| "queues"
	| "r2_buckets"
	| "services"
	| "kv_namespaces"
	| "mtls_certificates"
	| "vectorize"
	| "workflows"
	| "vpc_services"
>;

/**
 * Get the Wrangler configuration; read it from the give `configPath` if available.
 */
export function readConfig(
	args: ReadConfigCommandArgs,
	options: ReadConfigOptions = {}
): Config {
	const { rawConfig, configPath, userConfigPath } = experimental_readRawConfig(
		args,
		options
	);

	const { config, diagnostics } = normalizeAndValidateConfig(
		rawConfig,
		configPath,
		userConfigPath,
		args,
		options.preserveOriginalMain
	);

	if (diagnostics.hasWarnings() && !options?.hideWarnings) {
		logger.warn(diagnostics.renderWarnings());
	}
	if (diagnostics.hasErrors()) {
		throw new UserError(diagnostics.renderErrors());
	}

	return config;
}

export function readPagesConfig(
	args: ReadConfigCommandArgs,
	options: ReadConfigOptions = {}
): Omit<Config, "pages_build_output_dir"> & { pages_build_output_dir: string } {
	let rawConfig: RawConfig;
	let configPath: string | undefined;
	let userConfigPath: string | undefined;
	try {
		({ rawConfig, configPath, userConfigPath } = experimental_readRawConfig(
			args,
			options
		));
	} catch (e) {
		logger.error(e);
		throw new FatalError(
			`Your ${configFileName(configPath)} file is not a valid Pages configuration file`,
			EXIT_CODE_INVALID_PAGES_CONFIG
		);
	}

	if (!isPagesConfig(rawConfig)) {
		throw new FatalError(
			`Your ${configFileName(configPath)} file is not a valid Pages configuration file`,
			EXIT_CODE_INVALID_PAGES_CONFIG
		);
	}

	const { config, diagnostics } = normalizeAndValidateConfig(
		rawConfig,
		configPath,
		userConfigPath,
		args
	);

	if (diagnostics.hasWarnings() && !options.hideWarnings) {
		logger.warn(diagnostics.renderWarnings());
	}
	if (diagnostics.hasErrors()) {
		throw new UserError(diagnostics.renderErrors());
	}

	logger.debug(
		`Configuration file belonging to ⚡️ Pages ⚡️ project detected.`
	);

	const envNames = rawConfig.env ? Object.keys(rawConfig.env) : [];
	const projectName = rawConfig?.name;
	const pagesDiagnostics = validatePagesConfig(config, envNames, projectName);

	if (pagesDiagnostics.hasWarnings()) {
		logger.warn(pagesDiagnostics.renderWarnings());
	}
	if (pagesDiagnostics.hasErrors()) {
		throw new UserError(pagesDiagnostics.renderErrors());
	}

	return config as Omit<Config, "pages_build_output_dir"> & {
		pages_build_output_dir: string;
	};
}

export const parseRawConfigFile = (configPath: string): RawConfig => {
	if (configPath.endsWith(".toml")) {
		return parseTOML(readFileSync(configPath), configPath);
	}

	if (configPath.endsWith(".json") || configPath.endsWith(".jsonc")) {
		return parseJSONC(readFileSync(configPath), configPath) as RawConfig;
	}

	return {};
};

export const experimental_readRawConfig = (
	args: ReadConfigCommandArgs,
	options: ReadConfigOptions = {}
): {
	rawConfig: RawConfig;
	configPath: string | undefined;
	userConfigPath: string | undefined;
} => {
	// Load the configuration from disk if available
	const { configPath, userConfigPath } = resolveWranglerConfigPath(
		args,
		options
	);

	const rawConfig = parseRawConfigFile(configPath ?? "");

	return { rawConfig, configPath, userConfigPath };
};

export function withConfig<T>(
	handler: (
		args: OnlyCamelCase<T & CommonYargsOptions> & { config: Config }
	) => Promise<void>,
	options?: Parameters<typeof readConfig>[1]
) {
	return (args: OnlyCamelCase<T & CommonYargsOptions>) => {
		return handler({ ...args, config: readConfig(args, options) });
	};
}
