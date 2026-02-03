import { readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { brandColor, dim } from "@cloudflare/cli/colors";
import { spinner } from "@cloudflare/cli/interactive";
import type { C3Context } from "types";
import type { CompatDate } from "wrangler";

/**
 * Retrieves the latest workerd compatibility date
 *
 * @returns The latest compatibility date for workerd in the form "YYYY-MM-DD"
 */
export function getWorkerdCompatibilityDate(projectPath: string): CompatDate {
	const s = spinner();
	s.start("Retrieving current workerd compatibility date");

	try {
		const projectRequire = createRequire(join(projectPath, "package.json"));
		// eslint-disable-next-line @typescript-eslint/consistent-type-imports
		const wrangler: Awaited<typeof import("wrangler")> =
			projectRequire("wrangler");
		const date = wrangler.getLocalWorkerdCompatibilityDate();
		s.stop(`${brandColor("compatibility date")} ${dim(date)}`);
		return date;
	} catch {
		// Note: this fallback date doesn't have any special meaning, it's simply the latest compatibility date at the time of writing
		//       (source: https://github.com/cloudflare/workerd/blob/main/src/workerd/io/supported-compatibility-date.txt)
		const fallbackDate = "2026-02-04";
		s.stop(
			`${brandColor("compatibility date")} ${dim(
				`Could not find workerd date, falling back to "${fallbackDate}"`,
			)}`,
		);
		return fallbackDate;
	}
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
		"workers-types",
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
