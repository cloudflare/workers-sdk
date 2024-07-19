import { readdirSync } from "fs";
import { resolve } from "path";
import { brandColor, dim } from "@cloudflare/cli/colors";
import { spinner } from "@cloudflare/cli/interactive";
import { getLatestPackageVersion } from "./packages";
import type { C3Context } from "types";

/**
 * Look up the latest release of workerd and use its date as the compatibility_date
 * configuration value for wrangler.toml.
 *
 * If the look up fails then we fall back to a well known date.
 *
 * The date is extracted from the version number of the workerd package tagged as `latest`.
 * The format of the version is `major.yyyymmdd.patch`.
 *
 * @returns The latest compatibility date for workerd in the form "YYYY-MM-DD"
 */
export async function getWorkerdCompatibilityDate() {
	const s = spinner();
	s.start("Retrieving current workerd compatibility date");

	try {
		const latestWorkerdVersion = await getLatestPackageVersion("workerd");

		// The format of the workerd version is `major.yyyymmdd.patch`.
		const match = latestWorkerdVersion.match(/\d+\.(\d{4})(\d{2})(\d{2})\.\d+/);

		if (match) {
			const [, year, month, date] = match ?? [];
			const compatDate = `${year}-${month}-${date}`;

			s.stop(`${brandColor("compatibility date")} ${dim(compatDate)}`);
			return compatDate;
		}
	} catch {}

	const fallbackDate = "2023-05-18";

	s.stop(
		`${brandColor("compatibility date")} ${dim(
			` Could not find workerd date, falling back to ${fallbackDate}`,
		)}`,
	);
	return fallbackDate;
}

/**
 * Return that latest compatibility date formatted as a command line flag when
 * working with `wrangler`.
 *
 * @returns The latest workerd compatibility date in the form "--compatibility-date=YYYY-MM-DD"
 */
export const compatDateFlag = async () => {
	const workerdCompatDate = await getWorkerdCompatibilityDate();
	return `--compatibility-date=${workerdCompatDate}`;
};

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
	} catch (error) {
		return null;
	}
}
