import fs from "node:fs";
import path from "node:path";
import TOML from "@iarna/toml";
import dotenv from "dotenv";
import { FatalError, UserError } from "../errors";
import { logger } from "../logger";
import { EXIT_CODE_INVALID_PAGES_CONFIG } from "../pages/errors";
import { parseJSONC, parseTOML, readFileSync } from "../parse";
import { resolveWranglerConfigPath } from "./config-helpers";
import { isPagesConfig, normalizeAndValidateConfig } from "./validation";
import { validatePagesConfig } from "./validation-pages";
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

export type ReadConfigCommandArgs = NormalizeAndValidateConfigArgs & {
	config?: string;
	script?: string;
};

export type ReadConfigOptions = ResolveConfigPathOptions & {
	hideWarnings?: boolean;
};

/**
 * Get the Wrangler configuration; read it from the give `configPath` if available.
 */
export function readConfig(
	args: ReadConfigCommandArgs,
	options: ReadConfigOptions = {}
): Config {
	const { rawConfig, configPath } = experimental_readRawConfig(args, options);

	const { config, diagnostics } = normalizeAndValidateConfig(
		rawConfig,
		configPath,
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
	try {
		({ rawConfig, configPath } = experimental_readRawConfig(args, options));
	} catch (e) {
		logger.error(e);
		throw new FatalError(
			`Your ${configFileName(configPath)} file is not a valid Pages config file`,
			EXIT_CODE_INVALID_PAGES_CONFIG
		);
	}

	if (!isPagesConfig(rawConfig)) {
		throw new FatalError(
			`Your ${configFileName(configPath)} file is not a valid Pages config file`,
			EXIT_CODE_INVALID_PAGES_CONFIG
		);
	}

	const { config, diagnostics } = normalizeAndValidateConfig(
		rawConfig,
		configPath,
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

export const experimental_readRawConfig = (
	args: ReadConfigCommandArgs,
	options: ReadConfigOptions = {}
): { rawConfig: RawConfig; configPath: string | undefined } => {
	// Load the configuration from disk if available
	const configPath = resolveWranglerConfigPath(args, options);
	let rawConfig: RawConfig = {};
	if (configPath?.endsWith("toml")) {
		rawConfig = parseTOML(readFileSync(configPath), configPath);
	} else if (configPath?.endsWith("json") || configPath?.endsWith("jsonc")) {
		rawConfig = parseJSONC(readFileSync(configPath), configPath);
	}
	return { rawConfig, configPath };
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

export interface DotEnv {
	path: string;
	parsed: dotenv.DotenvParseOutput;
}

function tryLoadDotEnv(basePath: string): DotEnv | undefined {
	try {
		const parsed = dotenv.parse(fs.readFileSync(basePath));
		return { path: basePath, parsed };
	} catch (e) {
		if ((e as { code: string }).code === "ENOENT") {
			logger.debug(
				`.env file not found at "${path.relative(".", basePath)}". Continuing... For more details, refer to https://developers.cloudflare.com/workers/wrangler/system-environment-variables/`
			);
		} else {
			logger.debug(
				`Failed to load .env file "${path.relative(".", basePath)}":`,
				e
			);
		}
	}
}

/**
 * Loads a dotenv file from `envPath`, preferring to read `${envPath}.${env}` if
 * `env` is defined and that file exists.
 */
export function loadDotEnv(envPath: string, env?: string): DotEnv | undefined {
	if (env === undefined) {
		return tryLoadDotEnv(envPath);
	} else {
		return tryLoadDotEnv(`${envPath}.${env}`) ?? tryLoadDotEnv(envPath);
	}
}
