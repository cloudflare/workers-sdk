import {
	getVarsForDev as getSharedVarsForDev,
	loadDotEnv as loadSharedDotEnv,
} from "@cloudflare/dev-helpers/dev-vars";
import { logger } from "../logger";
import type { Binding, Logger } from "@cloudflare/workers-utils";
import type { Config } from "@cloudflare/workers-utils/config";
import type { DotenvParseOutput } from "dotenv";

export { getDefaultEnvFiles } from "@cloudflare/dev-helpers/dev-vars";

/** Load development variables with Wrangler's logger. */
export function getVarsForDev(
	configPath: string | undefined,
	envFiles: string[] | undefined,
	vars: Config["vars"],
	env: string | undefined,
	silent = false,
	secrets?: Config["secrets"]
): Record<
	string,
	Extract<Binding, { type: "plain_text" | "json" | "secret_text" }>
> {
	return getSharedVarsForDev(configPath, envFiles, vars, env, {
		silent,
		secrets,
		logger,
	});
}

/** Load dotenv files, allowing the CLI's early logging override. */
export function loadDotEnv(
	envPaths: string[],
	options: {
		includeProcessEnv: boolean;
		silent: boolean;
		logger?: Pick<Logger, "debug" | "log" | "warn" | "once">;
	}
): DotenvParseOutput {
	return loadSharedDotEnv(envPaths, {
		...options,
		logger: options.logger ?? logger,
	});
}
