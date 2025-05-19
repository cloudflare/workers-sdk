import path from "path";
import dotenv from "dotenv";
import dotenvExpand from "dotenv-expand";
import { logger } from "../logger";

export function loadDotEnv(
	basePath: string,
	{
		env,
		includeProcessEnv,
		silent,
	}: { env: string | undefined; includeProcessEnv: boolean; silent: boolean }
): dotenv.DotenvParseOutput | undefined {
	// Merge values from each of `.env`, `.env.local`, `.env.<env>`, and `.env.<env>.local` in that order.
	// Values in files to the right override the values in files to the left.
	const envPaths = [];
	if (env !== undefined) {
		envPaths.push(`${basePath}.${env}.local`, `${basePath}.${env}`);
	}
	envPaths.push(basePath + ".local", basePath);

	// The `parsedEnv` object will be mutated to contain the merged values.
	const parsedEnv = {};
	for (const envPath of envPaths) {
		// The `parsed` object only contains the values from the loaded .env file.
		const { error, parsed } = dotenv.config({
			path: envPath,
			processEnv: parsedEnv,
		});
		if (error) {
			logger.debug(`Failed to load .env file "${envPath}":`, error);
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
