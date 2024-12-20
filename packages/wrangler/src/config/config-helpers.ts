import fs from "node:fs";
import path from "node:path";
import { findUpSync } from "find-up";
import dedent from "ts-dedent";
import { UserError } from "../errors";
import { logger } from "../logger";
import { formatMessage, ParseError, parseJSONC, readFileSync } from "../parse";

export type ResolveConfigPathOptions = {
	useRedirect?: boolean;
};

export type ConfigPaths = {
	/** Absolute path to the actual configuration being used (possibly redirected from the user's config). */
	configPath: string | undefined;
	/** Absolute path to the user's configuration, which may not be the same as `configPath` if it was redirected. */
	userConfigPath: string | undefined;
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
	options: { useRedirect?: boolean }
): ConfigPaths {
	if (config !== undefined) {
		return { userConfigPath: config, configPath: config };
	}

	const leafPath = script !== undefined ? path.dirname(script) : process.cwd();

	return findWranglerConfig(leafPath, options);
}

/**
 * Find the wrangler config file by searching up the file-system
 * from the current working directory.
 */
export function findWranglerConfig(
	referencePath: string = process.cwd(),
	{ useRedirect = false } = {}
): ConfigPaths {
	const userConfigPath =
		findUpSync(`wrangler.json`, { cwd: referencePath }) ??
		findUpSync(`wrangler.jsonc`, { cwd: referencePath }) ??
		findUpSync(`wrangler.toml`, { cwd: referencePath });

	return {
		userConfigPath,
		configPath: useRedirect
			? findRedirectedWranglerConfig(referencePath, userConfigPath)
			: userConfigPath,
	};
}

/**
 * Check whether there is a config file that indicates that we should redirect the user configuration.
 * @param cwd
 * @param userConfigPath
 * @returns
 */
function findRedirectedWranglerConfig(
	cwd: string,
	userConfigPath: string | undefined
) {
	const PATH_TO_DEPLOY_CONFIG = ".wrangler/deploy/config.json";
	const deployConfigPath = findUpSync(PATH_TO_DEPLOY_CONFIG, { cwd });
	if (deployConfigPath === undefined) {
		return userConfigPath;
	}

	let redirectedConfigPath: string | undefined;
	const deployConfigFile = readFileSync(deployConfigPath);
	try {
		const deployConfig: { configPath?: string } = parseJSONC(
			deployConfigFile,
			deployConfigPath
		);
		redirectedConfigPath =
			deployConfig.configPath &&
			path.resolve(path.dirname(deployConfigPath), deployConfig.configPath);
	} catch (e) {
		throw new UserError(
			dedent`
				Failed to load the deploy config at ${path.relative(".", deployConfigPath)}
				${e instanceof ParseError ? formatMessage(e) : e}
			`
		);
	}
	if (!redirectedConfigPath) {
		throw new UserError(dedent`
			A redirect config was found at "${path.relative(".", deployConfigPath)}".
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
				There is a redirect configuration at "${path.relative(".", deployConfigPath)}".
				But the config path it points to, "${path.relative(".", redirectedConfigPath)}", does not exist.
			`);
		}
		if (userConfigPath) {
			if (
				path.join(path.dirname(userConfigPath), PATH_TO_DEPLOY_CONFIG) !==
				deployConfigPath
			) {
				throw new UserError(dedent`
					Found both a user config file at "${path.relative(".", userConfigPath)}"
					and a redirect config file at "${path.relative(".", deployConfigPath)}".
					But these do not share the same base path so it is not clear which should be used.
				`);
			}
		}

		logger.warn(dedent`
			Using redirected Wrangler configuration.
			Redirected config path: "${path.relative(".", redirectedConfigPath)}"
			Deploy config path: "${path.relative(".", deployConfigPath)}"
			Original config path: "${userConfigPath ? path.relative(".", userConfigPath) : "<no user config found>"}"
		`);
		return redirectedConfigPath;
	}
}
