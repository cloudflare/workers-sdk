import * as fs from "node:fs";
import * as path from "node:path";
import dotenv from "dotenv";
import { logger } from "../logger";
import type { Config } from "../config";

/**
 * Get the Worker `vars` bindings for a `wrangler dev` instance of a Worker.
 *
 * The `vars` bindings can be specified in the `wrangler.toml` configuration file.
 * But "secret" `vars` are usually only provided at the server -
 * either by creating them in the Dashboard UI, or using the `wrangler secret` command.
 *
 * It is useful during development, to provide these types of variable locally.
 * When running `wrangler dev` we will look for a file called `.dev.vars`, situated
 * next to the `wrangler.toml` file (or in the current working directory if there is no
 * `wrangler.toml`).
 *
 * Any values in this file, formatted like a `dotenv` file, will add to or override `vars`
 * bindings provided in the `wrangler.toml`.
 */
export function getVarsForDev(config: Config): Config["vars"] {
	const configDir = path.resolve(path.dirname(config.configPath ?? "."));
	const devVarsPath = path.resolve(configDir, ".dev.vars");
	if (fs.existsSync(devVarsPath)) {
		const devVarsRelativePath = path.relative(process.cwd(), devVarsPath);
		logger.log(`Using vars defined in ${devVarsRelativePath}`);
		const devVars = dotenv.parse(fs.readFileSync(devVarsPath, "utf8"));
		return {
			...config.vars,
			...devVars,
		};
	} else {
		return config.vars;
	}
}
