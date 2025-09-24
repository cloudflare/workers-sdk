import fs from "node:fs";
import path from "node:path";
import { findUpSync } from "find-up";
import dedent from "ts-dedent";
import { UserError } from "../errors";
import { logger } from "../logger";
import { formatMessage, ParseError, parseJSONC, readFileSync } from "../parse";
import type { RawConfig, RedirectedRawConfig } from "./config";

export type ResolveConfigPathOptions = {
	useRedirectIfAvailable?: boolean;
};

export type ConfigPaths = {
	/** Absolute path to the actual configuration being used (possibly redirected from the user's config). */
	configPath: string | undefined;
	/** Absolute path to the user's configuration, which may not be the same as `configPath` if it was redirected. */
	userConfigPath: string | undefined;
};

export const PATH_TO_DEPLOY_CONFIG = ".wrangler/deploy/config.json";

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
		return { userConfigPath: config, configPath: config };
	}

	const leafPath = script !== undefined ? path.dirname(script) : process.cwd();

	return findWranglerConfig(leafPath, options);
}

/**
 * Find the wrangler configuration file by searching up the file-system
 * from the current working directory.
 */
export function findWranglerConfig(
	referencePath: string = process.cwd(),
	{ useRedirectIfAvailable = false } = {}
): ConfigPaths {
	const userConfigPath =
		findUpSync(`wrangler.json`, { cwd: referencePath }) ??
		findUpSync(`wrangler.jsonc`, { cwd: referencePath }) ??
		findUpSync(`wrangler.toml`, { cwd: referencePath });

	return {
		userConfigPath,
		configPath: useRedirectIfAvailable
			? findRedirectedWranglerConfig(referencePath, userConfigPath)
			: userConfigPath,
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
) {
	const deployConfigPath = findUpSync(PATH_TO_DEPLOY_CONFIG, { cwd });
	if (deployConfigPath === undefined) {
		return userConfigPath;
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
			dedent`
				Failed to parse the deploy configuration file at ${path.relative(".", deployConfigPath)}
				${e instanceof ParseError ? formatMessage(e) : e}
			`
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

	if (redirectedConfigPath) {
		if (!fs.existsSync(redirectedConfigPath)) {
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

		logger.info(dedent`
			Using redirected Wrangler configuration.
			 - Configuration being used: "${path.relative(".", redirectedConfigPath)}"
			 - Original user's configuration: "${userConfigPath ? path.relative(".", userConfigPath) : "<no user config found>"}"
			 - Deploy configuration file: "${path.relative(".", deployConfigPath)}"
		`);
		return redirectedConfigPath;
	}
}

export function isRedirectedRawConfig(
	rawConfig: RawConfig,
	configPath: string | undefined,
	userConfigPath: string | undefined
): rawConfig is RedirectedRawConfig {
	return configPath !== undefined && configPath !== userConfigPath;
}
