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

/**
 * The compatibility date on which `nodejs_compat` started implying
 * `nodejs_compat_v2`.
 */
export const NODEJS_COMPAT_V2_SWITCH_OVER_DATE = "2024-09-23";

/**
 * Resolves whether workerd will enable the `nodejs_compat` and
 * `nodejs_compat_v2` features, mirroring how workerd itself resolves them from
 * the compatibility date and flags:
 * - Both are enabled by default from {@link NODEJS_COMPAT_DEFAULT_ON_DATE}
 *   onwards, and each must be turned off separately from that date, with
 *   `no_nodejs_compat` and `no_nodejs_compat_v2` respectively.
 * - Before that date, `nodejs_compat` implies `nodejs_compat_v2` from
 *   {@link NODEJS_COMPAT_V2_SWITCH_OVER_DATE} onwards.
 *
 * @param compatibilityDate The compatibility date
 * @param compatibilityFlags The compatibility flags
 */
export function resolveNodejsCompat(
	compatibilityDate: string,
	compatibilityFlags: string[]
): { isNodejsCompatEnabled: boolean; isNodejsCompatV2Enabled: boolean } {
	const isDefaultOn = isNodejsCompatDefaultOn(compatibilityDate);

	const isNodejsCompatEnabled =
		compatibilityFlags.includes("nodejs_compat") ||
		(isDefaultOn && !compatibilityFlags.includes("no_nodejs_compat"));

	const isNodejsCompatV2Enabled =
		compatibilityFlags.includes("nodejs_compat_v2") ||
		(!compatibilityFlags.includes("no_nodejs_compat_v2") &&
			(isDefaultOn ||
				(isNodejsCompatEnabled &&
					compatibilityDate >= NODEJS_COMPAT_V2_SWITCH_OVER_DATE)));

	return { isNodejsCompatEnabled, isNodejsCompatV2Enabled };
}

// TODO: remove when workerd no longer errors
/**
 * Removes the `nodejs_compat` and `nodejs_compat_v2` flags from a list of
 * compatibility flags when the compatibility date already enables them.
 *
 * workerd rejects a compatibility flag that its compatibility date enables by
 * default, so from {@link NODEJS_COMPAT_DEFAULT_ON_DATE} onwards specifying
 * either flag stops a Worker from starting up. Removing them is a no-op for
 * such a date, so tooling can accept the redundant flags rather than failing.
 *
 * A flag is kept when its matching opt-out is specified too, since workerd
 * reports those as contradictory and the enable flag wins there - dropping it
 * would silently switch Node.js compatibility off instead.
 *
 * @param compatibilityDate The compatibility date
 * @param compatibilityFlags The compatibility flags
 * @returns The flags, without the ones the date makes redundant
 */
export function stripRedundantNodejsCompatFlags(
	compatibilityDate: string | undefined,
	compatibilityFlags: string[]
): string[] {
	if (!isNodejsCompatDefaultOn(compatibilityDate)) {
		return compatibilityFlags;
	}

	const redundantFlags = ["nodejs_compat", "nodejs_compat_v2"].filter(
		(flag) => !compatibilityFlags.includes(`no_${flag}`)
	);

	return compatibilityFlags.filter((flag) => !redundantFlags.includes(flag));
}
