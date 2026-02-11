import { existsSync } from "node:fs";
import path from "node:path";
import { findUpSync } from "find-up";
import dedent from "ts-dedent";
import { PATH_TO_DEPLOY_CONFIG } from "../constants";
import { UserError } from "../errors";
import { parseJSONC, readFileSync } from "../parse";
import type { RawConfig, RedirectedRawConfig } from "./config";

export type ResolveConfigPathOptions = {
	useRedirectIfAvailable?: boolean;
};

/**
 * Config file names in priority order (highest to lowest).
 * Programmatic config files (.ts/.js) take precedence over static config files.
 */
const CONFIG_FILE_NAMES = [
	// Programmatic config files (TypeScript first, then JavaScript)
	"cf.config.ts",
	"cf.config.js",
	"cloudflare.config.ts",
	"cloudflare.config.js",
	"cf.ts",
	"cf.js",
	"cloudflare.ts",
	"cloudflare.js",
	"wrangler.config.ts",
	"wrangler.config.js",
	"wrangler.ts",
	"wrangler.js",
	// Static config files
	"wrangler.json",
	"wrangler.jsonc",
	"wrangler.toml",
] as const;

/**
 * Check if a config file path is a programmatic config (TypeScript or JavaScript).
 */
export function isProgrammaticConfigPath(
	configPath: string | undefined
): boolean {
	if (!configPath) return false;
	return configPath.endsWith(".ts") || configPath.endsWith(".js");
}

export type ConfigPaths = {
	/** Absolute path to the actual configuration being used (possibly redirected from the user's config). */
	configPath: string | undefined;
	/** Absolute path to the user's configuration, which may not be the same as `configPath` if it was redirected. */
	userConfigPath: string | undefined;
	/** Absolute path to the deploy config path used */
	deployConfigPath: string | undefined;
	/** Was a redirected config file read? */
	redirected: boolean;
};

/**
 * Resolve the path to the configuration file, given the `config` and `script` optional command line arguments.
 * `config` takes precedence, then `script`, then we just use the cwd.
 *
 * Returns an object with two paths: `configPath` and `userConfigPath`. If defined these are absolute file paths.
 */
export function resolveWranglerConfigPath(
	{
		config,
		script,
	}: {
		config?: string;
		script?: string;
	},
	options: { useRedirectIfAvailable?: boolean }
): ConfigPaths {
	if (config !== undefined) {
		return {
			userConfigPath: config,
			configPath: config,
			deployConfigPath: undefined,
			redirected: false,
		};
	}

	const leafPath = script !== undefined ? path.dirname(script) : process.cwd();

	return findWranglerConfig(leafPath, options);
}

/**
 * Find the wrangler configuration file by searching up the file-system
 * from the current working directory.
 *
 * Searches for config files in priority order:
 * 1. Programmatic configs: cf.config.ts, cloudflare.config.ts, etc.
 * 2. Static configs: wrangler.json, wrangler.jsonc, wrangler.toml
 */
export function findWranglerConfig(
	referencePath: string = process.cwd(),
	{ useRedirectIfAvailable = false } = {}
): ConfigPaths {
	// Search for config files in priority order
	let userConfigPath: string | undefined;
	for (const fileName of CONFIG_FILE_NAMES) {
		userConfigPath = findUpSync(fileName, { cwd: referencePath });
		if (userConfigPath) break;
	}

	if (!useRedirectIfAvailable) {
		return {
			userConfigPath,
			configPath: userConfigPath,
			deployConfigPath: undefined,
			redirected: false,
		};
	}

	const { configPath, deployConfigPath, redirected } =
		findRedirectedWranglerConfig(referencePath, userConfigPath);

	return {
		userConfigPath,
		configPath,
		deployConfigPath,
		redirected,
	};
}

/**
 * Check whether there is a configuration file that indicates that we should redirect the user configuration.
 * @param cwd
 * @param userConfigPath
 * @returns
 */
function findRedirectedWranglerConfig(
	cwd: string,
	userConfigPath: string | undefined
): {
	configPath: string | undefined;
	deployConfigPath: string | undefined;
	redirected: boolean;
} {
	const deployConfigPath = findUpSync(PATH_TO_DEPLOY_CONFIG, { cwd });
	if (deployConfigPath === undefined) {
		return { configPath: userConfigPath, deployConfigPath, redirected: false };
	}

	let redirectedConfigPath: string | undefined;
	const deployConfigFile = readFileSync(deployConfigPath);
	try {
		const deployConfig = parseJSONC(deployConfigFile, deployConfigPath) as {
			configPath?: string;
		};
		redirectedConfigPath =
			deployConfig.configPath &&
			path.resolve(path.dirname(deployConfigPath), deployConfig.configPath);
	} catch (e) {
		throw new UserError(
			`Failed to parse the deploy configuration file at ${path.relative(".", deployConfigPath)}`,
			{ cause: e }
		);
	}
	if (!redirectedConfigPath) {
		throw new UserError(dedent`
			A deploy configuration file was found at "${path.relative(".", deployConfigPath)}".
			But this is not valid - the required "configPath" property was not found.
			Instead this file contains:
			\`\`\`
			${deployConfigFile}
			\`\`\`
		`);
	}

	if (!existsSync(redirectedConfigPath)) {
		throw new UserError(dedent`
				There is a deploy configuration at "${path.relative(".", deployConfigPath)}".
				But the redirected configuration path it points to, "${path.relative(".", redirectedConfigPath)}", does not exist.
			`);
	}
	if (userConfigPath) {
		if (
			path.join(path.dirname(userConfigPath), PATH_TO_DEPLOY_CONFIG) !==
			deployConfigPath
		) {
			throw new UserError(dedent`
					Found both a user configuration file at "${path.relative(".", userConfigPath)}"
					and a deploy configuration file at "${path.relative(".", deployConfigPath)}".
					But these do not share the same base path so it is not clear which should be used.
				`);
		}
	}

	return {
		configPath: redirectedConfigPath,
		deployConfigPath,
		redirected: true,
	};
}

export function isRedirectedRawConfig(
	rawConfig: RawConfig,
	configPath: string | undefined,
	userConfigPath: string | undefined
): rawConfig is RedirectedRawConfig {
	return configPath !== undefined && configPath !== userConfigPath;
}
