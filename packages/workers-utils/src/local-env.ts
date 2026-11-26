import * as fs from "node:fs/promises";
import * as path from "node:path";
import { parse as parseDotEnvContent } from "dotenv";
import { expand } from "dotenv-expand";
import { caseInsensitiveEnv } from "./case-insensitive-env";

export { caseInsensitiveEnv } from "./case-insensitive-env";

export type LocalEnvValueSource =
	| { type: "file"; path: string }
	| { type: "process" };

export interface LoadedEnv {
	values: Record<string, string>;
	sources: Record<string, LocalEnvValueSource>;
}

interface ParsedFile {
	path: string;
	values: Record<string, string>;
}

/**
 * Parses dotenv contents and expands variable references without changing the
 * supplied process environment or adding its unrelated keys to the result.
 *
 * Process values override file values, including explicitly empty strings. On
 * Windows, process keys are matched case-insensitively. References can use
 * process values and earlier file values; unresolved references become empty
 * strings. Escape a dollar sign with `\$` to keep it literal.
 *
 * @param contents The dotenv contents to parse and expand.
 * @param processEnv The process values used for expansion and overrides.
 * Defaults to `process.env`.
 * @returns Expanded values for the keys declared in the dotenv contents.
 */
export function parseAndExpandDotEnv(
	contents: string,
	processEnv: NodeJS.ProcessEnv = process.env
): Record<string, string> {
	return expandParsedDotEnv(parseDotEnvContent(contents), processEnv);
}

function expandParsedDotEnv(
	parsed: Record<string, string>,
	processEnv: NodeJS.ProcessEnv
): Record<string, string> {
	const expanded = { ...parsed };
	const expandedKeys = Object.keys(expanded);
	const processEnvOverrides = copyProcessEnv(processEnv);
	expand({ parsed: expanded, processEnv: copyProcessEnv(processEnv) });

	for (const key of expandedKeys) {
		if (Object.hasOwn(processEnvOverrides, key)) {
			expanded[key] = processEnvOverrides[key];
		}
	}

	return expanded;
}

/**
 * Returns the local `.env` candidates in increasing precedence order.
 *
 * @param envDir The resolved environment directory. `false` disables file
 * loading, matching Vite's `envDir` convention.
 * @param mode The optional mode used for mode-specific files.
 * @returns Absolute candidate paths in load order.
 */
export function getEnvPaths(envDir: string | false, mode?: string): string[] {
	if (envDir === false) {
		return [];
	}

	const filenames = [
		".env",
		".env.local",
		...(mode === undefined ? [] : [`.env.${mode}`, `.env.${mode}.local`]),
	];
	return filenames.map((filename) => path.resolve(envDir, filename));
}

/**
 * Returns the `.dev.vars` candidates in decreasing selection priority.
 *
 * @param envDir The resolved environment directory. `false` disables file
 * loading, matching Vite's `envDir` convention.
 * @param mode The optional mode used to select `.dev.vars.<mode>`.
 * @returns Absolute candidate paths in selection order.
 */
export function getDevVarsCandidatePaths(
	envDir: string | false,
	mode?: string
): string[] {
	if (envDir === false) {
		return [];
	}

	return [
		...(mode === undefined ? [] : [`.dev.vars.${mode}`]),
		".dev.vars",
	].map((filename) => path.resolve(envDir, filename));
}

/**
 * Loads local `.env` files using Vite-compatible file precedence and
 * Wrangler-compatible parsing and expansion.
 *
 * Expansion is progressive: references can use process values and values
 * declared earlier in the merged environment, but not values declared later.
 * Loading has no process-global side effects.
 *
 * @param envDir The resolved environment directory. `false` disables file
 * loading, matching Vite's `envDir` convention.
 * @param mode The optional mode used for mode-specific files.
 * @returns Resolved values and metadata describing their sources.
 */
export async function loadEnv(
	envDir: string | false,
	mode?: string
): Promise<LoadedEnv> {
	if (mode === "local") {
		throw new Error(
			'"local" cannot be used as a mode name because it conflicts with the .local postfix for .env files.'
		);
	}

	const candidateFiles = getEnvPaths(envDir, mode);
	const parsed: Record<string, string> = {};
	const parsedSources: Record<string, LocalEnvValueSource> = {};

	for (const candidate of candidateFiles) {
		const loaded = await tryParseFile(candidate, parseDotEnvContent);
		if (loaded === undefined) {
			continue;
		}

		for (const [key, value] of Object.entries(loaded.values)) {
			parsed[key] = value;
			parsedSources[key] = { type: "file", path: loaded.path };
		}
	}

	const processEnv = copyProcessEnv(process.env);
	const values = expandParsedDotEnv(parsed, processEnv);
	const sources = { ...parsedSources };

	for (const [key, value] of Object.entries(processEnv)) {
		values[key] = value;
		sources[key] = { type: "process" };
	}

	return { values, sources };
}

/**
 * Loads the first existing `.dev.vars` candidate without merging it with other
 * files or process-environment values.
 *
 * @param envDir The resolved environment directory. `false` disables file
 * loading, matching Vite's `envDir` convention.
 * @param mode The optional mode used to select `.dev.vars.<mode>`.
 * @returns The selected `.dev.vars` values, or `undefined` when no candidate exists.
 */
export async function loadDevVars(
	envDir: string | false,
	mode?: string
): Promise<Record<string, string> | undefined> {
	const candidateFiles = getDevVarsCandidatePaths(envDir, mode);
	for (const candidate of candidateFiles) {
		const loaded = await tryParseFile(candidate, parseDotEnvContent);
		if (loaded === undefined) {
			continue;
		}

		return loaded.values;
	}
}

async function tryParseFile(
	filePath: string,
	parse: (contents: string) => Record<string, string>
): Promise<ParsedFile | undefined> {
	try {
		const stat = await fs.stat(filePath);
		if (!stat.isFile() && !stat.isFIFO()) {
			return;
		}
		return {
			path: filePath,
			values: parse(await fs.readFile(filePath, "utf8")),
		};
	} catch (error) {
		if (isMissingFileError(error)) {
			return;
		}
		throw error;
	}
}

function isMissingFileError(error: unknown): boolean {
	return (
		error instanceof Error &&
		"code" in error &&
		(error.code === "ENOENT" || error.code === "ENOTDIR")
	);
}

function copyProcessEnv(processEnv: NodeJS.ProcessEnv): Record<string, string> {
	const copied = process.platform === "win32" ? caseInsensitiveEnv() : {};
	for (const [key, value] of Object.entries(processEnv)) {
		if (value !== undefined) {
			copied[key] = value;
		}
	}
	return copied;
}
