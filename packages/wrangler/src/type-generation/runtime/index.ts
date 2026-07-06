import { generateRuntimeTypes as generateRuntimeTypesImpl } from "@cloudflare/runtime-types";
import { MissingCompatibilityDateError } from "../../cli-errors/type-generation";
import { logger } from "../../logger";
import type { Config } from "@cloudflare/workers-utils";

/**
 * Generates runtime types for a Workers project based on the provided project configuration.
 *
 * Thin adapter around `@cloudflare/runtime-types`' `generateRuntimeTypes` that maps wrangler's
 * snake_case `Config` shape onto the shared generator. Kept as a local module so that existing
 * tests can spy on `generateRuntimeTypes` via `import * as generateRuntime from "./runtime"`.
 *
 * The caller reads the existing `.d.ts` file (if any) and passes its contents as
 * `existingContent` for cache detection, so the file is read at most once per generation.
 *
 * @throws {MissingCompatibilityDateError} If the config file does not have a compatibility date.
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
	existingContent,
}: {
	config: Pick<Config, "compatibility_date" | "compatibility_flags">;
	existingContent?: string;
}): Promise<{ runtimeHeader: string; runtimeTypes: string }> {
	if (!compatibility_date) {
		throw new MissingCompatibilityDateError();
	}

	const { runtimeHeader, runtimeTypes, isCached } =
		await generateRuntimeTypesImpl({
			compatibilityDate: compatibility_date,
			compatibilityFlags: compatibility_flags,
			existingContent,
		});

	if (isCached) {
		logger.debug("Using cached runtime types: ", runtimeHeader);
	}

	return { runtimeHeader, runtimeTypes };
}
