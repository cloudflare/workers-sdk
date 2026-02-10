export const mockCreateDate = new Date(2025, 4, 1);
export const mockModifiedDate = new Date(2025, 4, 2);
export const mockStartDate = new Date(2021, 1, 1);
export const mockQueuedDate = new Date(2025, 1, 2);
export const mockEndDate = new Date(2025, 1, 3);

/**
 * Normalize the input string, to make it reliable to use in tests.
 */
export function normalizeString(input: string): string {
	return normalizeTables(
		normalizeDates(
			normalizeErrorMarkers(
				replaceByte(
					stripTrailingWhitespace(
						stripStartupProfileHash(
							normalizeSlashes(
								normalizeCwd(
									normalizeTempDirs(stripTimings(replaceThinSpaces(input)))
								)
							)
						)
					)
				)
			)
		)
	);
}

function stripStartupProfileHash(str: string): string {
	return str.replace(/startup-profile-[^/]+/g, "startup-profile-<HASH>");
}

function normalizeTables(str: string): string {
	return str
		.replaceAll(/┌─+/g, "┌─")
		.replaceAll(/┬─+/g, "┬─")
		.replaceAll(/ +│/g, " │")
		.replaceAll(/├─+/g, "├─")
		.replaceAll(/┼─+/g, "┼─")
		.replaceAll(/└─+/g, "└─")
		.replaceAll(/┴─+/g, "┴─");
}

function normalizeDates(str: string): string {
	return str
		.replaceAll(/\d+ (years?|days?|months?) ago/g, "[mock-time-ago]")
		.replaceAll(mockCreateDate.toLocaleString(), "[mock-create-date]")
		.replaceAll(mockModifiedDate.toLocaleString(), "[mock-modified-date]")
		.replaceAll(mockStartDate.toLocaleString(), "[mock-start-date]")
		.replaceAll(mockQueuedDate.toLocaleString(), "[mock-queued-date]")
		.replaceAll(mockEndDate.toLocaleString(), "[mock-end-date]");
}

/**
 * Normalize error `X` markers.
 *
 * Windows gets a different character.
 */
function normalizeErrorMarkers(str: string): string {
	return str.replaceAll("✘", "X");
}

/**
 * Ensure slashes in the `str` are OS file-system agnostic.
 *
 * Use this in snapshot tests to be resilient to file-system differences.
 */
function normalizeSlashes(str: string): string {
	return str.replace(/\\/g, "/");
}

/**
 * Replace any use of the current working directory with `<cwd>` to avoid cross OS issues.
 */
function normalizeCwd(str: string): string {
	return str.replaceAll(process.cwd(), "<cwd>");
}

/**
 * Strip "timing data" out of the `stdout` string, since this is not always deterministic.
 *
 * Use this in snapshot tests to be resilient to slight changes in timing of processing.
 */
function stripTimings(stdout: string): string {
	return stdout.replace(/\(\d+\.\d+ sec\)/g, "(TIMINGS)");
}

function stripTrailingWhitespace(str: string): string {
	return str.replace(/[^\S\n]+\n/g, "\n");
}

/**
 * Removing leading kilobit (tenth of a byte) from test output due to
 * variation causing every few tests the value to change by ± .01
 */
function replaceByte(stdout: string): string {
	return stdout.replaceAll(/\d+\.\d+ KiB/g, "xx KiB");
}

/**
 * Temp directories are created with random names, so we replace all comments temp dirs in them
 */
function normalizeTempDirs(stdout: string): string {
	return stdout.replaceAll(/\/\/.+\/tmp.+/g, "//tmpdir");
}

/**
 * Replace thin space characters (U+200A) with regular spaces to normalize output
 */
function replaceThinSpaces(str: string): string {
	return str.replaceAll(/\u200a/g, " ");
}
