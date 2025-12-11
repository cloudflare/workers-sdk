import assert from "node:assert";
import module from "node:module";
import undici from "undici";

type YYYY = `${number}${number}${number}${number}`;
type MM = `${number}${number}`;
type DD = `${number}${number}`;

/**
 * Represent a valid compatibility date, a string such as `2025-09-27`
 */
type CompatDate = `${YYYY}-${MM}-${DD}`;

type GetCompatDateOptions = {
	projectPath?: string;
	remote?: boolean;
};

type GetCompatDateResult = {
	date: CompatDate;
	source: "remote-workerd" | "local-workerd" | "fallback" | "today";
};

/**
 * Gets the latest workerd compatibility date either from the local workerd instance or
 * by checking in the npm registry the latest release of the workerd package
 *
 * @param options.remote whether the local version of workerd should be checked or the remote npm registry value should be used instead
 * @param options.projectPath the path to the project (only needed for the local check)
 * @returns an object including the compatibility date and its source, for the remove version of this function a promise to such project is returned instead
 */
export function getLatestWorkerdCompatibilityDate(options: {
	remote: true;
}): Promise<GetCompatDateResult>;
export function getLatestWorkerdCompatibilityDate(options?: {
	remote?: false;
	projectPath?: string;
}): GetCompatDateResult;
export function getLatestWorkerdCompatibilityDate({
	projectPath = process.cwd(),
	remote = false,
}: GetCompatDateOptions = {}):
	| GetCompatDateResult
	| Promise<GetCompatDateResult> {
	const fallbackDate = new Date("2025-09-27");
	const fallbackResult: GetCompatDateResult = toSafeCompatDateObject({
		date: toCompatDate(fallbackDate),
		source: "fallback",
	});

	if (remote) {
		return fetchLatestNpmPackageVersion("workerd")
			.then((latestWorkerdVersion) => {
				// The format of the workerd version is `major.yyyymmdd.patch`.
				const match = latestWorkerdVersion.match(
					/\d+\.(\d{4})(\d{2})(\d{2})\.\d+/
				);

				if (match) {
					const [, year, month, date] = match;
					const remoteCompatDate = new Date(`${year}-${month}-${date}`);
					return toSafeCompatDateObject({
						date: toCompatDate(remoteCompatDate),
						source: "remote-workerd" as const,
					});
				}

				return fallbackResult;
			})
			.catch(() => {
				return fallbackResult;
			});
	}

	try {
		const projectRequire = module.createRequire(projectPath);
		const miniflareEntry = projectRequire.resolve("miniflare");
		const miniflareRequire = module.createRequire(miniflareEntry);
		const miniflareWorkerd = miniflareRequire("workerd") as {
			compatibilityDate: string;
		};
		const workerdDate = miniflareWorkerd.compatibilityDate;
		return toSafeCompatDateObject({
			date: toCompatDate(new Date(workerdDate)),
			source: "local-workerd",
		});
	} catch {}

	return fallbackResult;
}

function toSafeCompatDateObject({
	date: dateStr,
	source,
}: GetCompatDateResult): GetCompatDateResult {
	const date = new Date(dateStr);
	// workerd releases often have a date for the following day.
	// Unfortunately, Workers deployments will fail if they specify
	// a compatibility date in the future. This means that most
	// who create a new project on the same day as a workerd
	// release will have their deployments fail until they
	// manually adjust the compatibility date.
	//
	// To work around this, we must manually ensure that the compat date
	// is not on a future UTC day when there was a recent workerd release.
	if (date.getTime() > Date.now()) {
		return {
			date: toCompatDate(new Date(Date.now())),
			source: "today",
		};
	}

	return {
		date: toCompatDate(date),
		source,
	};
}

function toCompatDate(date: Date): CompatDate {
	const dateString = date.toISOString().slice(0, 10);
	assert(
		isCompatDate(dateString),
		`"${dateString}" is unexpectedly not a compatibility date`
	);
	return dateString;
}

function isCompatDate(str: string): str is CompatDate {
	return /^\d{4}-\d{2}-\d{2}$/.test(str);
}

/**
 * Get the latest version of an npm package by making a request to the npm REST API.
 */
async function fetchLatestNpmPackageVersion(packageSpecifier: string) {
	const resp = await undici.fetch(
		`https://registry.npmjs.org/${packageSpecifier}`
	);
	const npmInfo = (await resp.json()) as NpmInfoResponse;
	return npmInfo["dist-tags"].latest;
}

type NpmInfoResponse = {
	"dist-tags": { latest: string };
};
