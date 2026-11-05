import { readFileSync } from "node:fs";
import path from "node:path";
import { UserError } from "@cloudflare/workers-utils";
import { caseInsensitiveEnv } from "@cloudflare/workers-utils/local-env";
import dotenv from "dotenv";
import dotenvExpand from "dotenv-expand";
import { logger } from "../logger";

const isWindows = process.platform === "win32";

/**
 * Reads a `.env` or `.dev.vars` file as UTF-8 text.
 *
 * Decoding errors would otherwise become replacement characters, so a UTF-16 file
 * (what `>` writes in Windows PowerShell 5.1) parses as an empty set of variables.
 * BOM-less UTF-16 can be valid UTF-8 bytes, so null characters are rejected too.
 *
 * @returns the file contents, or `undefined` if the file does not exist.
 * @throws a `UserError` if the file is not valid UTF-8 text.
 */
export function readEnvFile(filePath: string): string | undefined {
	let contents: Buffer;
	try {
		contents = readFileSync(filePath);
	} catch (error) {
		if (
			error instanceof Error &&
			"code" in error &&
			(error.code === "ENOENT" || error.code === "ENOTDIR")
		) {
			return undefined;
		}
		throw error;
	}
	let text: string | undefined;
	try {
		text = new TextDecoder("utf-8", { fatal: true }).decode(contents);
	} catch {}
	if (text === undefined || text.includes("\0")) {
		throw new UserError(
			`The file "${path.relative(process.cwd(), filePath)}" is not UTF-8 encoded, so its variables cannot be read. ` +
				`Save the file as UTF-8 and try again. (Windows PowerShell 5.1 writes UTF-16 when you use \`>\` or \`Out-File\`.)`,
			{ telemetryMessage: "env file invalid encoding" }
		);
	}
	return text;
}

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
	const parsedEnv = isWindows ? caseInsensitiveEnv() : {};
	for (const envPath of envPaths) {
		let contents: string | undefined;
		try {
			contents = readEnvFile(envPath);
		} catch (error) {
			if (error instanceof UserError) {
				// .env files are loaded for every command, so warn rather than fail.
				logger.once.warn(`${error.message} Ignoring this file.`);
			} else {
				logger.debug(`Failed to load .env file "${envPath}":`, error);
			}
			continue;
		}
		if (contents === undefined) {
			logger.debug(
				`.env file not found at "${envPath}". Continuing... For more details, refer to https://developers.cloudflare.com/workers/wrangler/system-environment-variables/`
			);
			continue;
		}
		Object.assign(parsedEnv, dotenv.parse(contents));
		if (!silent) {
			const relativePath = path.relative(process.cwd(), envPath);
			logger.log(`Using secrets defined in ${relativePath}`);
		}
	}

	// The `expandedEnv` object will be mutated to include the expanded values from `parsedEnv`
	// but only if the key is not already defined in `expandedEnv`.
	const expandedEnv = isWindows ? caseInsensitiveEnv() : {};
	if (includeProcessEnv) {
		Object.assign(expandedEnv, process.env);
		if (!silent) {
			logger.log("Using secrets defined in process.env");
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
