/**
 * Normalize the input string, to make it reliable to use in tests.
 */
export function normalizeString(input: string): string {
	return normalizeErrorMarkers(
		replaceByte(
			stripTrailingWhitespace(
				normalizeSlashes(normalizeTempDirs(stripTimings(input)))
			)
		)
	);
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
