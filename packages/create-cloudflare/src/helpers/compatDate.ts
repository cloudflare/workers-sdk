import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { getTodaysCompatDate } from "@cloudflare/workers-utils";
import type { C3Context } from "types";

/**
 * Retrieves the current date as a workerd compatibility date.
 *
 * Synchronous and free — just today's date in YYYY-MM-DD form. No
 * spinner / status line because there's nothing to wait for and the
 * value is always "today".
 *
 * @returns Today's date in the form "YYYY-MM-DD"
 */
export function getWorkerdCompatibilityDate(_projectPath: string) {
	return getTodaysCompatDate();
}

/**
 * Looks up the latest entrypoint found in the locally installed `@cloudflare/workers-types`
 * package. The entrypoint of this package is versioned by compat date since type definitions
 * change between compat dates.
 *
 * Learn more here: https://github.com/cloudflare/workerd/tree/main/npm/workers-types#compatibility-dates
 *
 * @param ctx - C3 context
 * @returns the latest types entrypoint in the form "YYYY-MM-DD"
 */
export function getLatestTypesEntrypoint(ctx: C3Context) {
	const workersTypesPath = resolve(
		ctx.project.path,
		"node_modules",
		"@cloudflare",
		"workers-types"
	);

	try {
		const entrypoints = readdirSync(workersTypesPath);

		const sorted = entrypoints
			.filter((filename) => filename.match(/(\d{4})-(\d{2})-(\d{2})/))
			.sort()
			.reverse();

		if (sorted.length === 0) {
			return null;
		}

		return sorted[0];
	} catch {
		return null;
	}
}
