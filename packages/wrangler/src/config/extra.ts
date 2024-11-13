import { existsSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { defu } from "defu";
import { logger } from "../logger";
import { parseJSONC, readFileSync } from "../parse";
import { Diagnostics } from "./diagnostics";
import { normalizeAndValidateEnvironment } from "./validation";
import { validateAdditionalProperties } from "./validation-helpers";
import type { Config, PagesConfigFields } from "./config";
import type { Environment } from "./environment";

/**
 * Merge additional configuration loaded from `.wrangler/config/extra.json`,
 * if it exists, into the user provided configuration.
 */
export function extendConfiguration(
	configPath: string | undefined,
	userConfig: Config,
	hideMessages: boolean
): { config: Config; diagnostics: Diagnostics } {
	// Handle extending the user configuration
	const extraPath = getExtraConfigPath(configPath && dirname(configPath));
	const extra = loadExtraConfig(extraPath);
	if (extra === undefined) {
		return { config: userConfig, diagnostics: new Diagnostics("") };
	}

	if (!hideMessages) {
		logger.info(
			`Loading additional configuration from ${relative(process.cwd(), extraPath)}.`
		);
	}

	return {
		config: defu<Config, [Config]>(extra.config, userConfig),
		diagnostics: extra.diagnostics,
	};
}

/**
 * Get the path to a file that might contain additional configuration to be merged into the user's configuration.
 *
 * This supports the case where a custom build tool wants to extend the user's configuration as well as pre-bundled files.
 */
function getExtraConfigPath(projectRoot: string | undefined): string {
	return resolve(projectRoot ?? ".", ".wrangler/config/extra.json");
}

/**
 * Attempt to load and validate extra config from the `.wrangler/config/extra.json` file if it exists.
 */
function loadExtraConfig(configPath: string):
	| {
			config: Environment & PagesConfigFields;
			diagnostics: Diagnostics;
	  }
	| undefined {
	if (!existsSync(configPath)) {
		return undefined;
	}

	const diagnostics = new Diagnostics(
		`Processing extra configuration found in ${relative(process.cwd(), configPath)}.`
	);
	const raw = parseJSONC<Environment & PagesConfigFields>(
		readFileSync(configPath),
		configPath
	);
	const config = normalizeAndValidateEnvironment(
		diagnostics,
		configPath,
		raw,
		/* isDispatchNamespace */ false
	);

	validateAdditionalProperties(
		diagnostics,
		"extended config",
		Object.keys(raw),
		[...Object.keys(config), "pages_build_output_dir"]
	);

	return {
		config: { ...config, pages_build_output_dir: raw.pages_build_output_dir },
		diagnostics,
	};
}
