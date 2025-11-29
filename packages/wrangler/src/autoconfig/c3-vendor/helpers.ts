import { brandColor, dim } from "@cloudflare/cli/colors";
import { spinner } from "@cloudflare/cli/interactive";
import undici from "undici";

/**
 * Look up the latest release of workerd and use its date as the compatibility_date
 * configuration value for a wrangler config file.
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

		// workerd releases often have a date for the following day.
		// Unfortunately, Workers deployments will fail if they specify
		// a compatibility date in the future. This means that most
		// who create a new project on the same day as a workerd
		// release will have their deployments fail until they
		// manually adjust the compatibility date.
		//
		// To work around this, we must manually ensure that the compat date
		// is not on a future UTC day when there was a recent workerd release.
		if (match) {
			const [, year, month, date] = match;
			let compatDate = new Date(`${year}-${month}-${date}`);
			if (compatDate.getTime() > Date.now()) {
				compatDate = new Date(Date.now());
			}
			const compatDateString = compatDate.toISOString().slice(0, 10);
			s.stop(`${brandColor("compatibility date")} ${dim(compatDateString)}`);
			return compatDateString;
		}
	} catch {}

	const fallbackDate = "2024-11-11";

	s.stop(
		`${brandColor("compatibility date")} ${dim(
			` Could not find workerd date, falling back to ${fallbackDate}`
		)}`
	);
	return fallbackDate;
}

/**
 * Get the latest version of an npm package by making a request to the npm REST API.
 */
async function getLatestPackageVersion(packageSpecifier: string) {
	const resp = await undici.fetch(
		`https://registry.npmjs.org/${packageSpecifier}`
	);
	const npmInfo = (await resp.json()) as NpmInfoResponse;
	return npmInfo["dist-tags"].latest;
}

type NpmInfoResponse = {
	"dist-tags": { latest: string };
};
