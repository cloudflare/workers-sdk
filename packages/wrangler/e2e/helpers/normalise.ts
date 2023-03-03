import stripAnsi from "strip-ansi";
export function normalizeOutput(
	stdout: string,
	replacers?: [string, string][]
): string {
	const functions = [
		npmStripTimings,
		removeWorkersDev,
		removeUUID,
		normalizeErrorMarkers,
		replaceByte,
		stripTrailingWhitespace,
		normalizeSlashes,
		normalizeTempDirs,
		stripTimings,
		removeVersionHeader,
		stripAnsi,
	];
	for (const f of functions) {
		stdout = f(stdout);
	}
	if (replacers) {
		for (const [from, to] of replacers) {
			stdout = stdout.replaceAll(from, to);
		}
	}
	return stdout;
}
function removeWorkersDev(str: string) {
	return str.replace(
		/https:\/\/(.+?)\..+?\.workers\.dev/g,
		"https://$1.SUBDOMAIN.workers.dev"
	);
}
function removeUUID(str: string) {
	return str.replace(
		/\w{8}-\w{4}-\w{4}-\w{4}-\w{12}/g,
		"00000000-0000-0000-0000-000000000000"
	);
}

/**
 * Remove the Wrangler version/update check header
 */
function removeVersionHeader(str: string): string {
	const splitByHeader = str.split(/----+\n/);
	return splitByHeader.length === 2 ? splitByHeader[1] : splitByHeader[0];
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
export function normalizeSlashes(str: string): string {
	return str.replace(/\\/g, "/");
}

/**
 * Strip "timing data" out of the `stdout` string, since this is not always deterministic.
 *
 * Use this in snapshot tests to be resilient to slight changes in timing of processing.
 */
export function stripTimings(stdout: string): string {
	return stdout.replace(/\(\d+\.\d+ sec\)/g, "(TIMINGS)");
}

/**
 * Strip npm "timing data" out of the `stdout` string, since this is not always deterministic.
 *
 * Use this in snapshot tests to be resilient to slight changes in timing of processing.
 */
export function npmStripTimings(stdout: string): string {
	return stdout
		.replace(
			/added \d+ packages, and audited \d+ packages in \d+s/,
			"added (N) packages, and audited (N) packages in (TIMINGS)"
		)
		.replace(
			/\d+ packages are looking for funding/,
			"(N) packages are looking for funding"
		);
}

export function stripTrailingWhitespace(str: string): string {
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
export function normalizeTempDirs(stdout: string): string {
	return stdout.replaceAll(/\/\/.+\/wrangler-smoke-.+/g, "//tmpdir");
}
