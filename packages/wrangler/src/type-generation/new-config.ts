import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
// `@cloudflare/config` is statically imported here. See new-config.ts for
// documentation of the upstream build warnings this triggers.
import { generateTypes } from "@cloudflare/config";
import { RUNTIME_TYPES_MARKER } from "@cloudflare/runtime-types";
import { logger } from "../logger";
import {
	DEFAULT_WORKERS_TYPES_FILE_NAME,
	DEFAULT_WORKERS_TYPES_FILE_PATH,
} from "./helpers";
import { generateRuntimeTypes } from "./runtime";
import type { NormalizedTypes } from "../experimental-config/load";
import type { ParsedInputWorkerConfig } from "@cloudflare/config";

/**
 * Re-generate `worker-configuration.d.ts` from `cloudflare.config.ts` under
 * `--experimental-new-config`. This is the new-config equivalent of the legacy
 * `checkTypesDiff` path — `checkTypesDiff` is NOT invoked when
 * `--experimental-new-config` is on.
 */
export async function regenerateNewConfigTypes(options: {
	cloudflareConfigPath: string;
	workerConfig: ParsedInputWorkerConfig;
	types: NormalizedTypes;
}): Promise<void> {
	if (!options.types.generate) {
		return;
	}

	// Read the existing file once: it feeds both the runtime-types cache check
	// and the diff-before-write.
	let existing: string | undefined;
	try {
		existing = await readFile(DEFAULT_WORKERS_TYPES_FILE_PATH, "utf-8");
	} catch {
		// File doesn't exist yet — fall through to write.
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

		if (options.types.includeRuntime) {
			const { runtimeHeader, runtimeTypes } = await generateRuntimeTypes({
				config: {
					compatibility_date: options.workerConfig.compatibilityDate,
					compatibility_flags: options.workerConfig.compatibilityFlags ?? [],
				},
				existingContent: existing,
			});
			content += `\n${runtimeHeader}\n${RUNTIME_TYPES_MARKER}\n${runtimeTypes}`;
		}
	} catch (e) {
		logger.error(e);
		return;
	}

	if (existing === content) {
		return;
	}

	try {
		await writeFile(DEFAULT_WORKERS_TYPES_FILE_PATH, content);
		logger.log(
			`📝 Regenerated ${path.relative(process.cwd(), DEFAULT_WORKERS_TYPES_FILE_NAME)} from ${path.relative(process.cwd(), options.cloudflareConfigPath)}.`
		);
	} catch (e) {
		logger.error(e);
	}
}
