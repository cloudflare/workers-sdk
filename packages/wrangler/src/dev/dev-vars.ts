import * as path from "node:path";
import { maybeGetFile } from "@cloudflare/workers-shared";
import {
	getCloudflareIncludeProcessEnvFromEnv,
	getCloudflareLoadDevVarsFromDotEnv,
} from "@cloudflare/workers-utils";
import dotenv from "dotenv";
import { getDefaultEnvFiles, loadDotEnv } from "../config/dot-env";
import { logger } from "../logger";
import type { Binding } from "../api/startDevWorker/types";
import type { Config } from "@cloudflare/workers-utils";
import type { Json } from "miniflare";

/**
 * A binding type for vars - plain_text, json, or secret_text.
 * Used as the return type for getVarsForDev.
 */
export type VarBinding = Extract<
	Binding,
	{ type: "plain_text" | "json" | "secret_text" }
>;

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
 * If there are no `.dev.vars*` file, (and CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV is not "false")
 * we will look for `.env*` files in the same directory.
 * If the `envFiles` option is set, we'll look for the `.env` files at those paths instead of the defaults.
 *
 * Any values in these files (all formatted like `.env` files) will add to or override `vars`
 * bindings provided in the Wrangler configuration file.
 *
 * @param configPath - The path to the Wrangler configuration file, if defined.
 * @param envFiles - An array of paths to .env files to load; if `undefined` the default .env files will be used (see `getDefaultEnvFiles()`).
 * The `envFiles` paths are resolved against the directory of the Wrangler configuration file, if there is one, otherwise against the current working directory.
 * @param vars - The existing `vars` bindings from the Wrangler configuration.
 * @param env - The specific environment name (e.g., "staging") or `undefined` if no specific environment is set.
 * @param silent - If true, will not log any messages about the loaded .dev.vars files or .env files.
 * @returns The merged `vars` as typed bindings. Config vars are `plain_text`/`json`, while `.dev.vars`/`.env` vars are `secret_text`.
 */
export function getVarsForDev(
	configPath: string | undefined,
	envFiles: string[] | undefined,
	vars: Config["vars"],
	env: string | undefined,
	silent = false
): Record<string, VarBinding> {
	// Start with config vars (plain_text or json, not secret)
	const result: Record<string, VarBinding> = {};
	for (const [key, value] of Object.entries(vars)) {
		result[key] = toVarBinding(value);
	}

	const configDir = path.resolve(configPath ? path.dirname(configPath) : ".");

	// If envFiles are not explicitly provided, try to load from .dev.vars first
	if (!envFiles?.length) {
		const devVarsPath = path.resolve(configDir, ".dev.vars");
		const loaded = loadDotDevDotVars(devVarsPath, env);
		if (loaded !== undefined) {
			const devVarsRelativePath = path.relative(process.cwd(), loaded.path);
			if (!silent) {
				logger.log(`Using vars defined in ${devVarsRelativePath}`);
			}
			// Merge .dev.vars as secret_text
			for (const [key, value] of Object.entries(loaded.parsed)) {
				result[key] = { type: "secret_text", value };
			}
			return result;
		}
	}

	// If .dev.vars wasn't loaded (either because envFiles was explicit or .dev.vars doesn't exist),
	// try loading from .env files
	if (getCloudflareLoadDevVarsFromDotEnv()) {
		const resolvedEnvFilePaths = (envFiles ?? getDefaultEnvFiles(env)).map(
			(p) => path.resolve(configDir, p)
		);
		const dotEnvVars = loadDotEnv(resolvedEnvFilePaths, {
			includeProcessEnv: getCloudflareIncludeProcessEnvFromEnv(),
			silent,
		});
		// Merge .env vars as secret_text
		for (const [key, value] of Object.entries(dotEnvVars)) {
			result[key] = { type: "secret_text", value: String(value) };
		}
		return result;
	}

	// Just return the vars from the Wrangler configuration.
	return result;
}

/**
 * Convert a raw config var value to a VarBinding (plain_text or json).
 */
function toVarBinding(value: string | Json): VarBinding {
	if (typeof value === "string") {
		return { type: "plain_text", value };
	}
	return { type: "json", value };
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
		throw new Error(
			`Failed to load local dev variables file "${path.relative(".", basePath)}":`,
			{ cause: e }
		);
	}
}

/**
 * Loads a .dev.vars file from `envPath`, preferring to read `${envPath}.${env}` if
 * `env` is defined and that file exists.
 */
export function loadDotDevDotVars(
	envPath: string,
	env?: string
): DotDevDotVars | undefined {
	return (
		(env !== undefined && tryLoadDotDevDotVars(`${envPath}.${env}`)) ||
		tryLoadDotDevDotVars(envPath)
	);
}
