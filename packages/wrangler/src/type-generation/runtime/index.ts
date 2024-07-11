import { spawn } from "child_process";
import { writeFile } from "fs/promises";
import { dirname, resolve } from "path";
import { fetch } from "undici";
import { logger } from "../../logger";
import { getBasePath } from "../../paths";
import { ensureDirectoryExists } from "../../utils/log-file";
import type { Config } from "../../config/config";

const OUTFILE_RELATIVE_PATH = "./.wrangler/types/runtime.d.ts";

/**
 * Generates runtime types for a Cloudflare Workers project based on the provided project configuration.
 *
 * This function is designed to be isolated and portable, making it easy to integrate into various
 * build processes or development workflows. It handles the entire process of generating runtime
 * types, from ensuring the output directory exists to spawning the workerd process and writing
 * the generated types to a file.
 *
 * @param {string} configPath - The path to the configuration file.
 * @param {Config} config - The parsed configuration object.
 *
 * @throws {Error} If the config file does not have a compatibility date.
 *
 * @example
 * import { generateRuntimeTypes } from './path/to/this/file';
 * import { readConfig } from './path/to/config';
 *
 * const configPath = './wrangler.toml';
 * const config = readConfig(configPath);
 *
 * await generateRuntimeTypes(configPath, config);
 * // This will generate runtime types and write them to ./.wrangler/types/runtime.d.ts
 *
 * @remarks
 * - This function relies on the `generate` function to perform the actual type generation.
 * - It uses the logger to provide informative output during the process.
 * - The generated types are written to a file specified by OUTFILE_RELATIVE_PATH.
 * - This could be improved by hashing the compat date and flags to avoid unnecessary regeneration.
 */
export async function generateRuntimeTypes(configPath: string, config: Config) {
	if (!config.compatibility_date) {
		throw new Error("Config file must have a compatability date.");
	}
	const configDir = dirname(configPath);
	const outfileRelative = OUTFILE_RELATIVE_PATH;
	const outfileAbsolute = resolve(configDir, outfileRelative);

	await ensureDirectoryExists(outfileAbsolute);

	logger.log("Generating runtime types");
	await generate({
		outfilePath: outfileAbsolute,
		compatibilityDate: config.compatibility_date,
		compatibilityFlags: config.compatibility_flags,
	});
	logger.log(`Runtime types generated and written to ${outfileRelative} \n`);
}

/**
 * Generates runtime types for Cloudflare Workers by spawning a workerd process with the type-generation
 * worker, and then making a request to that worker to fetch types.
 *
 * @param {Object} options - The options for type generation.
 * @param {string} options.outfilePath - The absolute path where the generated types will be written.
 * @param {string} options.compatibilityDate - The compatibility date for the Workers runtime.
 * @param {string[]} [options.compatibilityFlags=[]] - Optional compatibility flags.
 *
 * @throws {Error} If the workerd process fails to start or if the server doesn't respond after multiple retries.
 *
 * @remarks
 * - `workerd` path and config file path are hard-coded here, but would be imported from node_modules in a production version.
 * - It implements a retry mechanism to ensure the workerd server is ready before fetching types.
 * - Logging is added throughout the function. A production version would be more judicious about what to log and when. For example, it could choose to return the std output of the workerd process so that the calling function could decide.
 */
export async function generate({
	outfilePath,
	compatibilityDate,
	compatibilityFlags = [],
}: {
	outfilePath: string;
	compatibilityDate: string;
	compatibilityFlags?: string[];
}) {
	const workerdPath = resolve(
		getBasePath(),
		"./src/type-generation/runtime/worker/workerd"
	);
	const capnpConfigPath = resolve(
		getBasePath(),
		"./src/type-generation/runtime/worker/config.capnp"
	);

	logger.log(`Starting workerd on http://localhost:8080`);

	const proc = spawn(workerdPath, ["serve", capnpConfigPath, "--experimental"]);

	proc.on("error", (error) => {
		logger.error(`Failed to start workerd: ${error.message}.`);
		throw error;
	});

	const flagsString = compatibilityFlags.length
		? `+${compatibilityFlags.join("+")}`
		: "";

	const url = `http://localhost:8080/${compatibilityDate}${flagsString}`;

	let retries = 0;
	const maxRetries = 1000; // 100 seconds total
	while (retries < maxRetries) {
		try {
			await fetch(url);
			break;
		} catch (error) {
			if (retries === maxRetries - 1) {
				throw new Error(`Server did not respond after ${maxRetries} attempts`);
			}
			await new Promise((res) => setTimeout(res, 100));
			retries++;
		}
	}

	logger.log(`Fetching types from ${url}`);
	const res = await fetch(url);
	const content = await res.text();

	logger.log(`Writing types to ${outfilePath}`);
	await writeFile(outfilePath, content, "utf8");

	proc.kill();
}
