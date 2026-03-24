import assert from "node:assert";
import { compatibilityDate as workerdCompatibilityDate } from "workerd";

export type YYYY = `${number}${number}${number}${number}`;
export type MM = `${number}${number}`;
export type DD = `${number}${number}`;

/**
 * String representing a date following the Cloudflare compatibility date format, such as `2025-09-27`
 */
export type CompatDate = `${YYYY}-${MM}-${DD}`;

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

/**
 * Gets a safe compatibility date from workerd. If the workerd compatibility
 * date is in the future, returns today's date instead. This handles the case
 * where workerd releases set their compatibility date up to 7 days in the future.
 */
function getSafeCompatibilityDate(): CompatDate {
	// The compatibility data from workerd follows the CompatDate format
	assert(isCompatDate(workerdCompatibilityDate));

	const today = formatCompatibilityDate(new Date());

	if (workerdCompatibilityDate > today) {
		return today;
	}

	return workerdCompatibilityDate;
}

/** `YYYY-MM-DD` compatibility date */
const supportedCompatibilityDate = getSafeCompatibilityDate();

export { supportedCompatibilityDate };
