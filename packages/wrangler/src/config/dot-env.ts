import path from "path";
import dotenv from "dotenv";
import dotenvExpand from "dotenv-expand";
import { logger } from "../logger";

/**
 * Generates the default array of `envFiles` for .env file loading.
 *
 * The default order is [`.env`, `.env.local`, `.env.<env>`, `.env.<env>.local`].
 *
 * @param env - The specific environment name (e.g., "staging") or `undefined` if no specific environment is set.
 * @returns An array of strings representing the relative paths to the default .env files.
 */
export function getDefaultEnvFiles(env: string | undefined): string[] {
	// Generate the default paths for .env files based on the provided base path and environment.
	const envFiles = [".env", ".env.local"];
	if (env !== undefined) {
		envFiles.push(`.env.${env}`);
		envFiles.push(`.env.${env}.local`);
	}
	return envFiles;
}

/**
 * Loads environment variables from .env files.
 *
 * This will merge values from each of of the `envPaths` in order.
 * Values in the file at `envPaths[x+1]` will override the values in the files at `envPaths[x]`.
 *
 * Further, once merged values are expanded, meaning that if a value references another variable
 * (e.g., `FOO=${BAR}`), it will be replaced with the value of `BAR` if it exists.
 *
 * @param envPaths - An array of absolute paths to .env files to load.
 * @param options.includeProcessEnv - If true, will include the current process environment variables in the merged result.
 * @param options.silent - If true, will not log any messages about the loaded .env files.
 * @returns An object containing the merged and expanded environment variables.
 */
export function loadDotEnv(
	envPaths: string[],
	{ includeProcessEnv, silent }: { includeProcessEnv: boolean; silent: boolean }
): dotenv.DotenvParseOutput {
	// The `parsedEnv` object will be mutated to contain the merged values.
	const parsedEnv = {};
	for (const envPath of envPaths) {
		// The `parsed` object only contains the values from the loaded .env file.
		const { error, parsed } = dotenv.config({
			path: envPath,
			processEnv: parsedEnv,
			override: true,
		});
		if (error) {
			if ("code" in error && error.code === "ENOENT") {
				logger.debug(
					`.env file not found at "${envPath}". Continuing... For more details, refer to https://developers.cloudflare.com/workers/wrangler/system-environment-variables/`
				);
			} else {
				logger.debug(`Failed to load .env file "${envPath}":`, error);
			}
		} else if (parsed && !silent) {
			const relativePath = path.relative(process.cwd(), envPath);
			logger.log(`Using vars defined in ${relativePath}`);
		}
	}

	// The `expandedEnv` object will be mutated to include the expanded values from `parsedEnv`
	// but only if the key is not already defined in `expandedEnv`.
	const expandedEnv = {};
	if (includeProcessEnv) {
		Object.assign(expandedEnv, process.env);
		if (!silent) {
			logger.log("Using vars defined in process.env");
		}
	}
	const { error } = dotenvExpand.expand({
		processEnv: expandedEnv,
		parsed: parsedEnv,
	});
	if (error) {
		logger.debug(`Failed to expand .env values:`, error);
	}
	return expandedEnv;
}
