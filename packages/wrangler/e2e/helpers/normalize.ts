import stripAnsi from "strip-ansi";

export function normalizeOutput(
	stdout: string,
	substitutions?: Record<string, string>
): string {
	const functions = [
		removeVersionHeader,
		removeStandardPricingWarning,
		npmStripTimings,
		removeWorkersDev,
		removeWorkerPreviewUrl,
		removeUUID,
		normalizeErrorMarkers,
		replaceByte,
		stripTrailingWhitespace,
		normalizeSlashes,
		normalizeTempDirs,
		stripTimings,
		stripAnsi,
		removeTimestamp,
		stripDevTimings,
		stripEmptyNewlines,
		normalizeDebugLogFilepath,
		removeLocalPort,
		removeZeroWidthSpaces,
	];
	for (const f of functions) {
		stdout = f(stdout);
	}
	if (substitutions) {
		for (const [from, to] of Object.entries(substitutions)) {
			stdout = stdout.replaceAll(from, to);
		}
	}
	return stdout.trim();
}

function stripEmptyNewlines(stdout: string): string {
	return stdout.replace(/\n+/g, "\n");
}

function stripDevTimings(stdout: string): string {
	return stdout.replace(/\(\dms\)/g, "(TIMINGS)");
}

function removeWorkerPreviewUrl(str: string) {
	return str.replace(
		/https:\/\/(?<sha>[a-f\d]+)-(?<workerName>.+)-(?<uuid>\w{8}-\w{4}-\w{4}-\w{4}-\w{12})\..+?\.workers\.dev/g,
		"https://$2-PREVIEW-URL.SUBDOMAIN.workers.dev"
	);
}
function removeWorkersDev(str: string) {
	return str.replace(
		/https:\/\/(.+?)\..+?\.workers\.dev/g,
		"https://$1.SUBDOMAIN.workers.dev"
	);
}

function removeTimestamp(str: string) {
	return str
		.replace(/\d\d\d\d-\d\d-\d\dT\d\d:\d\d:\d\d\.\d+?Z/g, "TIMESTAMP")
		.replace(/\d\d:\d\d:\d\d/g, "TIMESTAMP");
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
	const header = str.match(/⛅️ wrangler .*\n----+\n/);
	if (header !== null && header.index) {
		return str.slice(header.index + header[0].length);
	} else {
		return str;
	}
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
	return stdout
		.replace(/\(\d+\.\d+ sec\)/g, "(TIMINGS)")
		.replace(/\d+ ms/g, "(TIMINGS)");
}

/**
 * Strip npm "timing data" out of the `stdout` string, since this is not always deterministic.
 *
 * Use this in snapshot tests to be resilient to slight changes in timing of processing.
 */
export function npmStripTimings(stdout: string): string {
	return stdout
		.replace(
			/added \d+ packages, and audited \d+ packages in [\dms]+/,
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

/**
 * Debug log files are created with a timestamp, so we replace the debug log filepath timestamp with <TIMESTAMP>
 */
export function normalizeDebugLogFilepath(stdout: string): string {
	return stdout
		.replace(/🪵 {2}Writing logs to ".+\.log"/, '🪵  Writing logs to "<LOG>"')
		.replace(
			/🪵 {2}Logs were written to ".+\.log"/,
			'🪵  Logs were written to "<LOG>"'
		);
}

/**
 * Squash the one or more local network bindings from `$ wrangler dev`
 */
export function removeLocalPort(stdout: string): string {
	return stdout.replace(
		/\[wrangler:inf\] Ready on (https?):\/\/(.+):\d{4,5}/,
		"[wrangler:inf] Ready on $1://$2:<PORT>"
	);
}

/**
 * This may or may not be displayed depending on whether the test account has accepted standard pricing.
 */
function removeStandardPricingWarning(stdout: string): string {
	return stdout.replace(
		/🚧 New Workers Standard pricing is now available\. Please visit the dashboard to view details and opt-in to new pricing: https:\/\/dash\.cloudflare\.com\/[^/]+\/workers\/standard\/opt-in\./,
		""
	);
}

function removeZeroWidthSpaces(stdout: string) {
	return stdout.replaceAll(/\u200a|\u200b/g, " ");
}
