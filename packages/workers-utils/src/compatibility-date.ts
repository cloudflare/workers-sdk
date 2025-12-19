import assert from "node:assert";
import module from "node:module";

type YYYY = `${number}${number}${number}${number}`;
type MM = `${number}${number}`;
type DD = `${number}${number}`;

/**
 * Represent a valid compatibility date, a string such as `2025-09-27`
 */
type CompatDate = `${YYYY}-${MM}-${DD}`;

type GetCompatDateOptions = {
	projectPath?: string;
};

type GetCompatDateResult = {
	date: CompatDate;
	source: "workerd" | "fallback" | "today";
};

/**
 * Gets compatibility date either of the locally installed workerd package.
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
			date: toCompatDate(new Date(workerdDate)),
			source: "workerd",
		});
	} catch {}

	const fallbackDate = new Date("2025-09-27");
	return toSafeCompatDateObject({
		date: toCompatDate(fallbackDate),
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
