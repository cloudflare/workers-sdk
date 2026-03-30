import assert from "node:assert";
import path from "node:path";
import {
	configFileName,
	experimental_readRawConfig,
	FatalError,
	isPagesConfig,
	normalizeAndValidateConfig,
	UserError,
	validatePagesConfig,
} from "@cloudflare/workers-utils";
import dedent from "ts-dedent";
import { version as wranglerVersion } from "../../package.json";
import { logger } from "../logger";
import { EXIT_CODE_INVALID_PAGES_CONFIG } from "../pages/errors";
import { updateCheck } from "../update-check";
import type {
	Config,
	ConfigBindingOptions,
	Diagnostics,
	NormalizeAndValidateConfigArgs,
	RawConfig,
	ResolveConfigPathOptions,
} from "@cloudflare/workers-utils";

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

export type { ConfigBindingOptions };

/**
 * Log config warnings. If any unexpected fields were found and a newer version
 * of Wrangler is available, also log a contextual upgrade hint — the unexpected
 * field may be supported in the newer version.
 */
async function logWarningsWithUpgradeHint(
	diagnostics: Diagnostics,
	hideWarnings: boolean | undefined
): Promise<void> {
	if (!diagnostics.hasWarnings() || hideWarnings) {
		return;
	}
	logger.warn(diagnostics.renderWarnings());
	if (diagnostics.hasUnexpectedFieldsInTree()) {
		const latestVersion = await updateCheck();
		if (latestVersion !== undefined) {
			logger.log(
				`There is a newer version of Wrangler available ` +
					`(current: ${wranglerVersion}, latest: ${latestVersion}). ` +
					`Try upgrading, as it might support this configuration option.`
			);
		}
	}
}

/**
 * Get the Wrangler configuration; read it from the give `configPath` if available.
 */
export function readConfig(
	args: ReadConfigCommandArgs,
	options: ReadConfigOptions = {}
): Config {
	const {
		rawConfig,
		configPath,
		userConfigPath,
		deployConfigPath,
		redirected,
	} = experimental_readRawConfig(args, options);
	if (redirected) {
		assert(configPath, "Redirected config found without a configPath");
		assert(
			deployConfigPath,
			"Redirected config found without a deployConfigPath"
		);
		logger.info(dedent`
				Using redirected Wrangler configuration.
				 - Configuration being used: "${path.relative(".", configPath)}"
				 - Original user's configuration: "${userConfigPath ? path.relative(".", userConfigPath) : "<no user config found>"}"
				 - Deploy configuration file: "${path.relative(".", deployConfigPath)}"
			`);
	}

	const { config, diagnostics } = normalizeAndValidateConfig(
		rawConfig,
		configPath,
		userConfigPath,
		args,
		options.preserveOriginalMain
	);

	void logWarningsWithUpgradeHint(diagnostics, options?.hideWarnings);
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
	let redirected: boolean;
	let deployConfigPath: string | undefined;
	try {
		({ rawConfig, configPath, userConfigPath, deployConfigPath, redirected } =
			experimental_readRawConfig(args, options));
		if (redirected) {
			assert(configPath, "Redirected config found without a configPath");
			assert(
				deployConfigPath,
				"Redirected config found without a deployConfigPath"
			);
			logger.info(dedent`
				Using redirected Wrangler configuration.
				 - Configuration being used: "${path.relative(".", configPath)}"
				 - Original user's configuration: "${userConfigPath ? path.relative(".", userConfigPath) : "<no user config found>"}"
				 - Deploy configuration file: "${path.relative(".", deployConfigPath)}"
			`);
		}
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

	void logWarningsWithUpgradeHint(diagnostics, options.hideWarnings);
	if (diagnostics.hasErrors()) {
		throw new UserError(diagnostics.renderErrors());
	}

	logger.debug(`Configuration file belonging to ⚡️ Pages ⚡️ project detected.`);

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
