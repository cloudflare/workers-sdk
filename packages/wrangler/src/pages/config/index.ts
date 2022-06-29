import { logger } from "../../logger";
import { parseTOML, readFileSync } from "../../parse";
import { normalizeAndValidatePagesConfig } from "./validation";
import type { PagesConfig, RawPagesConfig } from "./config";

export function readPagesConfig(
	configPath: string,
	args: unknown
): PagesConfig {
	let rawConfig: RawPagesConfig = {};

	// TODO: for now, throw an error if name of the file isn't exactly "pages.toml"

	// Load the configuration from disk if available
	if (configPath) {
		rawConfig = parseTOML(readFileSync(configPath), configPath);
	}

	// Process the top-level configuration.
	const { config, diagnostics } = normalizeAndValidatePagesConfig(
		rawConfig,
		configPath,
		args
	);

	if (diagnostics.hasWarnings()) {
		logger.warn(diagnostics.renderWarnings());
	}
	if (diagnostics.hasErrors()) {
		throw new Error(diagnostics.renderErrors());
	}

	return config;
}

// export function readWranglerPagesConfig(configPath: string, args: unknown) {
// 	// throw if config.type !== 'pages'
// }
