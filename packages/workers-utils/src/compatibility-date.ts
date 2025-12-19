import assert from "node:assert";
import module from "node:module";

type YYYY = `${number}${number}${number}${number}`;
type MM = `${number}${number}`;
type DD = `${number}${number}`;

/**
 * Represents a valid compatibility date, a string such as `2025-09-27`
 */
export type CompatDate = `${YYYY}-${MM}-${DD}`;

type GetCompatDateOptions = {
	projectPath?: string;
};

type GetCompatDateResult = {
	date: CompatDate;
	source: "workerd" | "fallback" | "today";
};

/**
 * Gets the compatibility date of the locally installed workerd package.
 *
 * If the package is not found the fallback date of 2025-09-27 is returned instead.
 *
 * Additionally, if the workerd date is set to the future then the current date is returned instead.
 *
 * @param options.projectPath the path to the project
 * @returns an object including the compatibility date and its source
 */
export function getLocalWorkerdCompatibilityDate({
	projectPath = process.cwd(),
}: GetCompatDateOptions = {}): GetCompatDateResult {
	try {
		const projectRequire = module.createRequire(projectPath);
		const miniflareEntry = projectRequire.resolve("miniflare");
		const miniflareRequire = module.createRequire(miniflareEntry);
		const miniflareWorkerd = miniflareRequire("workerd") as {
			compatibilityDate: string;
		};
		const workerdDate = miniflareWorkerd.compatibilityDate;
		return toSafeCompatDateObject({
			date: formatCompatibilityDate(new Date(workerdDate)),
			source: "workerd",
		});
	} catch {}

	const fallbackDate = new Date("2025-09-27");
	return toSafeCompatDateObject({
		date: formatCompatibilityDate(fallbackDate),
		source: "fallback",
	});
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
			date: formatCompatibilityDate(new Date(Date.now())),
			source: "today",
		};
	}

	return {
		date: formatCompatibilityDate(date),
		source,
	};
}

/**
 * Discern whether a string represents a compatibility date (`YYYY-MM-DD`)
 *
 * @param str The target string
 * @returns true if the string represents a compatibility date, false otherwise
 */
export function isCompatDate(str: string): str is CompatDate {
	return /^\d{4}-\d{2}-\d{2}$/.test(str);
}

/**
 * Returns the date formatted as a compatibility date
 *
 * @param date The target date to convert
 * @returns The date as a CompatDate string (a string following the format `YYYY-MM-DD`)
 */
export function formatCompatibilityDate(date: Date): CompatDate {
	const compatDate = date.toISOString().slice(0, 10);
	assert(isCompatDate(compatDate));
	return compatDate;
}
