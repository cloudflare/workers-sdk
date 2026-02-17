import assert from "node:assert";
import { supportedCompatibilityDate } from ".";

export type YYYY = `${number}${number}${number}${number}`;
export type MM = `${number}${number}`;
export type DD = `${number}${number}`;

/**
 * Represents a valid compatibility date, a string such as `2025-09-27`
 */
export type CompatDate = `${YYYY}-${MM}-${DD}`;

/**
 * Gets the compatibility date of the locally installed workerd package.
 *
 * @returns The latest compatibility date supported by the local workerd package
 */
export function getLocalWorkerdCompatibilityDate(): CompatDate {
	return toSafeCompatibilityDate(new Date(supportedCompatibilityDate));
}

/**
 * Workerd releases often have a date for the following day.
 * Unfortunately, Workers deployments will fail if they specify a compatibility date in the future. This means that most
 * who create a new project on the same day as a workerd release will have their deployments fail until they
 * manually adjust the compatibility date.
 *
 * To work around this, we must manually ensure that the compat date is not on a future UTC day when there was a recent workerd release.
 *
 * This function is the used to convert potential future dates to safe compatibility dates.
 *
 * @param date The local workerd date to check and convert
 * @returns A compat date created using today's date if the local workerd date is in the future, one using the local workerd date otherwise
 */
function toSafeCompatibilityDate(date: Date): CompatDate {
	if (date.getTime() > Date.now()) {
		return formatCompatibilityDate(new Date());
	}

	return formatCompatibilityDate(date);
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
