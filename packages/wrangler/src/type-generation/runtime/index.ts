import { generateRuntimeTypes as generateRuntimeTypesImpl } from "@cloudflare/runtime-types";
import { logger } from "../../logger";
import type { Config } from "@cloudflare/workers-utils";

const DEFAULT_OUTFILE_RELATIVE_PATH = "worker-configuration.d.ts";

/**
 * Generates runtime types for a Workers project based on the provided project configuration.
 *
 * Thin adapter around `@cloudflare/runtime-types`' `generateRuntimeTypes` that maps wrangler's
 * snake_case `Config` shape onto the shared generator. Kept as a local module so that existing
 * tests can spy on `generateRuntimeTypes` via `import * as generateRuntime from "./runtime"`.
 *
 * @throws {Error} If the config file does not have a compatibility date.
 *
 * @example
 * import { generateRuntimeTypes } from './path/to/this/file';
 * import { readConfig } from './path/to/config';
 *
 * const config = readConfig('./wrangler.toml');
 * await generateRuntimeTypes({ config });
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

	const { runtimeHeader, runtimeTypes, isCached } =
		await generateRuntimeTypesImpl({
			compatibilityDate: compatibility_date,
			compatibilityFlags: compatibility_flags,
			outFile,
		});

	if (isCached) {
		logger.debug("Using cached runtime types: ", runtimeHeader);
	}

	return { runtimeHeader, runtimeTypes };
}
