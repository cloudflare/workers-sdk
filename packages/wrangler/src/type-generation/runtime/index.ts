import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { Miniflare } from "miniflare";
import { version } from "workerd";
import { logger } from "../../logger";
import { getRuntimeHeader, RUNTIME_HEADER_COMMENT_PREFIX } from "../helpers";
import type { Config } from "@cloudflare/workers-utils";

const DEFAULT_OUTFILE_RELATIVE_PATH = "worker-configuration.d.ts";

/**
 * Generates runtime types for a Workers project based on the provided project configuration.
 *
 * This function is designed to be isolated and portable, making it easy to integrate into various
 * build processes or development workflows. It handles the whole process of generating runtime
 * types, from ensuring the output directory exists to spawning the workerd process (via Miniflare)
 * and writing the generated types to a file.
 *
 * @throws {Error} If the config file does not have a compatibility date.
 *
 * @example
 * import { generateRuntimeTypes } from './path/to/this/file';
 * import { readConfig } from './path/to/config';
 *
 * const configPath = './wrangler.toml';
 * const config = readConfig(configPath);
 * const outFile = '/Users/me/my-project/dist/runtime.d.ts'
 *
 * // This will generate runtime types and write them to ./.wrangler/types/runtime.d.ts
 * await generateRuntimeTypes({ config });
 *
 * * // This will generate runtime types and write them to /Users/me/my-project/dist/runtime.d.ts
 * await generateRuntimeTypes({ config, outFile });
 *
 * @remarks
 * - The generated types are written to a file specified by DEFAULT_OUTFILE_RELATIVE_PATH.
 * - This could be improved by hashing the compat date and flags to avoid unnecessary regeneration.
 */

export async function generateRuntimeTypes({
	config: { compatibility_date, compatibility_flags = [] },
	outFile = DEFAULT_OUTFILE_RELATIVE_PATH,
}: {
	config: Pick<Config, "compatibility_date" | "compatibility_flags">;
	outFile?: string;
}): Promise<{ runtimeHeader: string; runtimeTypes: string }> {
	if (!compatibility_date) {
		throw new Error("Config must have a compatibility date.");
	}

	const header = getRuntimeHeader(
		version,
		compatibility_date,
		compatibility_flags
	);

	try {
		const lines = (await readFile(outFile, "utf8")).split("\n");
		const existingHeader = lines.find((line) =>
			line.startsWith(RUNTIME_HEADER_COMMENT_PREFIX)
		);
		const existingTypesStart = lines.findIndex(
			(line) => line === "// Begin runtime types"
		);
		if (existingHeader === header && existingTypesStart !== -1) {
			logger.debug("Using cached runtime types: ", header);

			return {
				runtimeHeader: header,
				runtimeTypes: lines.slice(existingTypesStart + 1).join("\n"),
			};
		}
	} catch (e) {
		if ((e as { code: string }).code !== "ENOENT") {
			throw e;
		}
	}

	const types = await generate({
		compatibilityDate: compatibility_date,
		// Ignore nodejs compat flags as there is currently no mechanism to generate these dynamically.
		compatibilityFlags: compatibility_flags.filter(
			(flag) => !flag.includes("nodejs_compat")
		),
	});

	return { runtimeHeader: header, runtimeTypes: types };
}

/**
 * Generates runtime types for Cloudflare Workers by spawning a workerd process with the type-generation
 * worker, and then making a request to that worker to fetch types.
 */
async function generate({
	compatibilityDate,
	compatibilityFlags = [],
}: {
	compatibilityDate: string;
	compatibilityFlags?: string[];
}) {
	const worker = readFileSync(require.resolve("workerd/worker.mjs")).toString();
	const mf = new Miniflare({
		compatibilityDate: "2024-01-01",
		compatibilityFlags: ["nodejs_compat", "rtti_api"],
		modules: true,
		script: worker,
	});

	const flagsString = compatibilityFlags.length
		? `+${compatibilityFlags.join("+")}`
		: "";

	const path = `http://dummy.com/${compatibilityDate}${flagsString}`;

	try {
		const res = await mf.dispatchFetch(path);
		const text = await res.text();

		if (!res.ok) {
			throw new Error(text);
		}

		return text;
	} finally {
		await mf.dispose();
	}
}
