import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { brandColor, dim } from "@cloudflare/cli-shared-helpers/colors";
import { spinner } from "@cloudflare/cli-shared-helpers/interactive";
import { getTodaysCompatDate, isCompatDate } from "@cloudflare/workers-utils";
import { version as workerdVersion } from "workerd/package.json";
import type { CompatDate } from "@cloudflare/workers-utils";
import type { C3Context } from "types";

/**
 * Retrieves the compatibility date to scaffold into a new project.
 *
 * This is today's date, so new projects start on the latest behaviour, but
 * clamped to the newest date the bundled `workerd` actually supports. A freshly
 * scaffolded project pins that same `workerd`, so writing a date beyond it means
 * the project refuses to start on its very first `dev` (see #14942, a regression
 * of #1948).
 *
 * @returns The compatibility date in the form "YYYY-MM-DD"
 */
export function getWorkerdCompatibilityDate(_projectPath: string) {
	const s = spinner();
	s.start("Retrieving current workerd compatibility date");

	const date = clampToWorkerdSupportedDate(getTodaysCompatDate());

	s.stop(`${brandColor("compatibility date")} ${dim(date)}`);
	return date;
}

/**
 * Clamps a compatibility date to the newest date the bundled `workerd` supports.
 *
 * `workerd` is versioned as `1.YYYYMMDD.x`, where `YYYYMMDD` is the newest
 * compatibility date it recognises. If the version can't be parsed we return the
 * date unchanged rather than guessing.
 */
function clampToWorkerdSupportedDate(date: CompatDate): CompatDate {
	const match = workerdVersion.match(/^\d+\.(\d{4})(\d{2})(\d{2})\.\d+$/);
	if (!match) {
		return date;
	}

	const [, year, month, day] = match;
	const supported = `${year}-${month}-${day}`;

	return isCompatDate(supported) && supported < date ? supported : date;
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
