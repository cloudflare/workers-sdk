import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
// `@cloudflare/config` is statically imported here. See new-config.ts for
// documentation of the upstream build warnings this triggers.
import { generateTypes } from "@cloudflare/config";
import { logger } from "../logger";
import {
	DEFAULT_WORKERS_TYPES_FILE_NAME,
	DEFAULT_WORKERS_TYPES_FILE_PATH,
} from "./helpers";
import type { NormalizedTypes } from "../experimental-config/load";

/**
 * Re-generate `worker-configuration.d.ts` from `cloudflare.config.ts` under
 * `--experimental-new-config`. This is the new-config equivalent of the legacy
 * `checkTypesDiff` path — `checkTypesDiff` is NOT invoked when
 * `--experimental-new-config` is on.
 */
export async function regenerateNewConfigTypes(options: {
	cloudflareConfigPath: string;
	types: NormalizedTypes;
}): Promise<void> {
	if (!options.types.generate) {
		return;
	}

	let content: string;
	try {
		const outputDir = path.dirname(
			path.resolve(DEFAULT_WORKERS_TYPES_FILE_PATH)
		);
		const relativeConfigPath =
			"./" + path.relative(outputDir, options.cloudflareConfigPath);
		content = generateTypes({
			configPath: relativeConfigPath,
			packageName: "wrangler/experimental-config",
		});
	} catch (e) {
		logger.error(e);
		return;
	}

	// Diff against the on-disk file before writing to avoid mtime churn
	// (matches the Vite plugin's behaviour for the same `.d.ts`).
	let existing: string | undefined;
	try {
		existing = readFileSync(DEFAULT_WORKERS_TYPES_FILE_PATH, "utf-8");
	} catch {
		// File doesn't exist yet — fall through to write.
	}

	if (existing === content) {
		return;
	}

	try {
		writeFileSync(DEFAULT_WORKERS_TYPES_FILE_PATH, content);
		logger.log(
			`📝 Regenerated ${path.relative(process.cwd(), DEFAULT_WORKERS_TYPES_FILE_NAME)} from ${path.relative(process.cwd(), options.cloudflareConfigPath)}.`
		);
	} catch (e) {
		logger.error(e);
	}
}
