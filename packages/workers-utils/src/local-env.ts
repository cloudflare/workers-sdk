import * as fs from "node:fs/promises";
import * as path from "node:path";
import { parse as parseDotEnv } from "dotenv";
import { expand } from "dotenv-expand";

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
 * Returns the local `.env` candidates in increasing precedence order.
 *
 * @param envDir The resolved environment directory, or `false` to disable file loading.
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
 * @param envDir The resolved environment directory, or `false` to disable file loading.
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
 * @param envDir The resolved environment directory, or `false` to disable file loading.
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
		const loaded = await tryParseFile(candidate, parseDotEnv);
		if (loaded === undefined) {
			continue;
		}

		for (const [key, value] of Object.entries(loaded.values)) {
			parsed[key] = value;
			parsedSources[key] = { type: "file", path: loaded.path };
		}
	}

	const processEnv = copyProcessEnv();
	expand({ parsed, processEnv: { ...processEnv } });

	const values = { ...parsed };
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
 * @param envDir The resolved environment directory, or `false` to disable file loading.
 * @param mode The optional mode used to select `.dev.vars.<mode>`.
 * @returns The selected `.dev.vars` values, or `undefined` when no candidate exists.
 */
export async function loadDevVars(
	envDir: string | false,
	mode?: string
): Promise<Record<string, string> | undefined> {
	const candidateFiles = getDevVarsCandidatePaths(envDir, mode);
	for (const candidate of candidateFiles) {
		const loaded = await tryParseFile(candidate, parseDotEnv);
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
	} catch {
		return;
	}

	return {
		path: filePath,
		values: parse(await fs.readFile(filePath, "utf8")),
	};
}

function copyProcessEnv(): Record<string, string> {
	return Object.fromEntries(
		Object.entries(process.env).filter(
			(entry): entry is [string, string] => entry[1] !== undefined
		)
	);
}
