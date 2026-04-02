import assert from "node:assert";

type YYYY = `${number}${number}${number}${number}`;
type MM = `${number}${number}`;
type DD = `${number}${number}`;

/**
 * Represents a valid compatibility date, a string such as `2025-09-27`
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
function formatCompatibilityDate(date: Date): CompatDate {
	const compatDate = date.toISOString().slice(0, 10);
	assert(isCompatDate(compatDate));
	return compatDate;
}

/**
 * Returns today's date as a compatibility date string (`YYYY-MM-DD`).
 */
export function getTodaysCompatDate(): CompatDate {
	return formatCompatibilityDate(new Date());
}
