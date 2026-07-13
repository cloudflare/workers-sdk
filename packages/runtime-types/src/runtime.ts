import * as fsp from "node:fs/promises";
import { createRequire } from "node:module";
import { Miniflare } from "miniflare";
import { version } from "workerd";
import {
	getRuntimeHeader,
	RUNTIME_HEADER_COMMENT_PREFIX,
	RUNTIME_TYPES_MARKER,
} from "./header";

// `require.resolve` is not available in native ESM, so reconstruct it from the
// current module URL. This resolves correctly both when this package is run
// directly (ESM) and when it is bundled into a consumer.
const require = createRequire(import.meta.url);

/**
 * Generates runtime types for a Workers project based on the provided compatibility settings.
 *
 * This function is designed to be isolated and portable, making it easy to integrate into various
 * build processes or development workflows. It handles the whole process of generating runtime
 * types, from spawning the workerd process (via Miniflare) to returning the generated types.
 *
 * If `existingContent` already contains runtime types generated for the same workerd version,
 * compatibility date and flags, the cached types are returned instead of regenerating them.
 * The caller is responsible for reading the existing `.d.ts` file (if any) and passing its
 * contents, so the file is read at most once per generation.
 *
 * @example
 * import { generateRuntimeTypes } from "@cloudflare/runtime-types";
 *
 * const { runtimeHeader, runtimeTypes, isCached } = await generateRuntimeTypes({
 *   compatibilityDate: "2024-11-06",
 *   compatibilityFlags: ["nodejs_compat"],
 *   existingContent: await readFile("worker-configuration.d.ts", "utf8"),
 * });
 *
 * @remarks
 * `nodejs_compat` flags are ignored as there is currently no mechanism to generate these
 * dynamically; consumers should instead prompt users to install `@types/node`.
 */
export async function generateRuntimeTypes({
	compatibilityDate,
	compatibilityFlags = [],
	existingContent,
}: {
	compatibilityDate: string;
	compatibilityFlags?: string[];
	existingContent?: string;
}): Promise<{
	runtimeHeader: string;
	runtimeTypes: string;
	isCached: boolean;
}> {
	const header = getRuntimeHeader(
		version,
		compatibilityDate,
		compatibilityFlags
	);

	if (existingContent !== undefined) {
		const lines = existingContent.split("\n");
		const existingHeader = lines.find((line) =>
			line.startsWith(RUNTIME_HEADER_COMMENT_PREFIX)
		);
		const existingTypesStart = lines.findIndex(
			(line) => line === RUNTIME_TYPES_MARKER
		);
		if (existingHeader === header && existingTypesStart !== -1) {
			return {
				runtimeHeader: header,
				runtimeTypes: lines.slice(existingTypesStart + 1).join("\n"),
				isCached: true,
			};
		}
	}

	const types = await generate({
		compatibilityDate,
		// Ignore nodejs compat flags as there is currently no mechanism to generate these dynamically.
		compatibilityFlags: compatibilityFlags.filter(
			(flag) => !flag.includes("nodejs_compat")
		),
	});

	return { runtimeHeader: header, runtimeTypes: types, isCached: false };
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
	const worker = (
		await fsp.readFile(require.resolve("workerd/worker.mjs"))
	).toString();
	const mf = new Miniflare({
		// Must stay before the 2024-09-23 nodejs_compat v1->v2 switchover: the
		// workerd RTTI worker only runs under nodejs_compat v1. This date is
		// internal to type generation and never appears in the output/header.
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
