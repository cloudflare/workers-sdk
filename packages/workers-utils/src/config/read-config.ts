import assert from "node:assert";
import path from "node:path";
import { dedent } from "ts-dedent";
import { UserError } from "../errors";
import { normalizeAndValidateConfig } from "./validation";
import { experimental_readRawConfig } from ".";
import type { ReadConfigCommandArgs, ReadConfigOptions } from ".";
import type { Logger } from "../logger";
import type { Config } from "./config";
import type { Diagnostics } from "./diagnostics";

/**
 * Read, normalize and validate the Wrangler configuration, reading it from `args.config` if provided.
 *
 * @param args The config path and arguments used to normalize the config (e.g. `env`)
 * @param options Options for resolving and validating the config
 * @param options.logger The logger used to report redirected configs and validation warnings
 * @param options.logWarnings Optional override for how validation warnings are reported
 * @returns The normalized and validated config
 */
export function readConfig(
	args: ReadConfigCommandArgs,
	options: ReadConfigOptions & {
		logger: Pick<Logger, "info" | "warn">;
		logWarnings?: (diagnostics: Diagnostics) => void;
	}
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
		options.logger.info(dedent`
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

	if (options.logWarnings) {
		options.logWarnings(diagnostics);
	} else if (diagnostics.hasWarnings() && !options.hideWarnings) {
		options.logger.warn(diagnostics.renderWarnings());
	}
	if (diagnostics.hasErrors()) {
		throw new UserError(diagnostics.renderErrors(), {
			telemetryMessage: "config wrangler validation failed",
		});
	}

	return config;
}
