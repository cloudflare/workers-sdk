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

/**
 * The compatibility date on which the `nodejs_compat` and `nodejs_compat_v2`
 * compatibility flags became enabled by default in workerd.
 *
 * From this date onwards, specifying either flag explicitly is a validation
 * error ("The compatibility flag nodejs_compat became the default as of
 * 2026-08-04 so does not need to be specified anymore"), so tooling must not
 * add them to configurations using such a compatibility date.
 *
 * @see https://github.com/cloudflare/workerd/blob/main/src/workerd/io/compatibility-date.capnp
 */
export const NODEJS_COMPAT_DEFAULT_ON_DATE = "2026-08-04";

/**
 * Whether workerd enables Node.js compatibility by default for the given
 * compatibility date, i.e. without the `nodejs_compat` flag being specified.
 *
 * @param compatibilityDate The compatibility date to check
 * @returns true if the date is on or after {@link NODEJS_COMPAT_DEFAULT_ON_DATE}
 */
export function isNodejsCompatDefaultOn(
	compatibilityDate: string | undefined
): boolean {
	return (
		compatibilityDate !== undefined &&
		compatibilityDate >= NODEJS_COMPAT_DEFAULT_ON_DATE
	);
}
