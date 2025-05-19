import * as path from "node:path";
import { maybeGetFile } from "@cloudflare/workers-shared";
import dotenv from "dotenv";
import { getDefaultEnvPaths, loadDotEnv } from "../config/dot-env";
import { getCloudflareIncludeProcessEnvFromEnv } from "../environment-variables/misc-variables";
import { logger } from "../logger";
import type { Config } from "../config";

/**
 * Get the Worker `vars` bindings for a `wrangler dev` instance of a Worker.
 *
 * The `vars` bindings can be specified in the Wrangler configuration file.
 * But "secret" `vars` are usually only provided at the server -
 * either by creating them in the Dashboard UI, or using the `wrangler secret` command.
 *
 * It is useful during development, to provide these types of variable locally.
 * When running `wrangler dev` we will look for a file called `.dev.vars`, situated
 * next to the User's Wrangler configuration file (or in the current working directory if there is no
 * Wrangler configuration). If the `--env <env>` option is set, we'll first look for
 * `.dev.vars.<env>`.
 *
 * If there are no `.dev.vars*` file, we will look for `.env*` files in the same directory.
 * If the `--env-file <file-path>` option is set, we'll look for the `.env*` files at that path.
 *
 * Any values in these files (all formatted like `.env` files) will add to or override `vars`
 * bindings provided in the Wrangler configuration file.
 *
 */
export function getVarsForDev(
	config: Pick<Config, "userConfigPath" | "vars">,
	env: string | undefined,
	silent = false
): Config["vars"] {
	const configDir = path.resolve(
		config.userConfigPath ? path.dirname(config.userConfigPath) : "."
	);

	// First, try to load from .dev.vars
	const devVarsPath = path.resolve(configDir, ".dev.vars");
	const loaded = loadDotDevDotVars(devVarsPath, env);
	if (loaded !== undefined) {
		const devVarsRelativePath = path.relative(process.cwd(), loaded.path);
		if (!silent) {
			logger.log(`Using vars defined in ${devVarsRelativePath}`);
		}
		return {
			...config.vars,
			...loaded.parsed,
		};
	} else {
		// If no .dev.vars files load vars from .env files in the configuration directory.
		const dotEnvVars = loadDotEnv(
			getDefaultEnvPaths(path.resolve(path.join(configDir, ".env")), env),
			{
				includeProcessEnv: getCloudflareIncludeProcessEnvFromEnv(),
				silent,
			}
		);
		return {
			...config.vars,
			...dotEnvVars,
		};
	}
}

export interface DotDevDotVars {
	path: string;
	parsed: dotenv.DotenvParseOutput;
}

function tryLoadDotDevDotVars(basePath: string): DotDevDotVars | undefined {
	try {
		const contents = maybeGetFile(basePath);
		if (contents === undefined) {
			logger.debug(
				`local dev variables file not found at "${path.relative(".", basePath)}". Continuing... For more details, refer to https://developers.cloudflare.com/workers/wrangler/system-environment-variables/`
			);
			return;
		}

		const parsed = dotenv.parse(contents);
		return { path: basePath, parsed };
	} catch (e) {
		logger.debug(
			`Failed to load local dev variables file "${path.relative(".", basePath)}":`,
			e
		);
	}
}

/**
 * Loads a .dev.vars (or .env style) file from `envPath`, preferring to read `${envPath}.${env}` if
 * `env` is defined and that file exists.
 */
export function loadDotDevDotVars(
	envPath: string,
	env?: string
): DotDevDotVars | undefined {
	if (env === undefined) {
		return tryLoadDotDevDotVars(envPath);
	} else {
		return (
			tryLoadDotDevDotVars(`${envPath}.${env}`) ?? tryLoadDotDevDotVars(envPath)
		);
	}
}
