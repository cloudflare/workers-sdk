import TOML from "@iarna/toml";
import { prompt, select } from "../dialogs";
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

export async function updateConfigFile(
	snippet: (
		bindingName?: string
	) => Partial<{ [K in keyof CfWorkerInit["bindings"]]: RawConfig[K] }>,
	configPath: Config["configPath"],
	env: string | undefined,
	offerToUpdate: boolean = true
) {
	const resource = Object.keys(snippet())[0] as keyof CfWorkerInit["bindings"];
	const envString = env ? ` in the "${env}" environment` : "";
	logger.log(
		`To access your new ${friendlyBindingNames[resource]} in your Worker, add the following snippet to your configuration file${envString}:`
	);

	logger.log(formatConfigSnippet(snippet(), configPath));

	if (configPath && offerToUpdate && configFormat(configPath) === "jsonc") {
		const autoAdd = await select(
			"Would you like Wrangler to add it on your behalf?",
			{
				choices: [
					{ title: "Yes", value: "yes" },
					{
						title: "Yes, but let me choose the binding name",
						value: "yes-but",
					},
					{ title: "No", value: "no" },
				],
				defaultOption: 0,
				fallbackOption: 2,
			}
		);
		let bindingName;

		if (autoAdd === "yes-but") {
			bindingName = await prompt("What binding name would you like to use?");
		}

		if (autoAdd !== "no") {
			experimental_patchConfig(
				configPath,
				env ? { env: { [env]: snippet(bindingName) } } : snippet(bindingName),
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

	const { diagnostics, config } = normalizeAndValidateConfig(
		rawConfig,
		configPath,
		userConfigPath,
		args
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
