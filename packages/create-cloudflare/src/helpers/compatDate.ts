import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { brandColor, dim } from "@cloudflare/cli-shared-helpers/colors";
import { spinner } from "@cloudflare/cli-shared-helpers/interactive";
import { DEFAULT_COMPAT_DATE } from "@cloudflare/workers-utils";
import type { C3Context } from "types";

/**
 * Retrieves the compatibility date to scaffold projects with, which is the
 * release date of the workerd version that this release of C3 supports.
 *
 * @returns The compatibility date in the form "YYYY-MM-DD"
 */
export function getWorkerdCompatibilityDate() {
	const s = spinner();
	s.start("Selecting workerd compatibility date");
	s.stop(`${brandColor("compatibility date")} ${dim(DEFAULT_COMPAT_DATE)}`);

	return DEFAULT_COMPAT_DATE;
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
