/**
 * When uploading assets we print out progress messages that look like:
 *
 * Uploading... (1/4)
 * Uploading... (2/4)
 * Uploading... (4/4)
 *
 * Note that we don't always get a progress message for every item uploaded.
 * These upload counts are not deterministic and can change from test run to test run.
 *
 * Also if you run the tests in --runInBand mode then we never see any of
 * these progress messages in the tests!!
 *
 * So this helper removes these message from the snapshots to keep them consistent.
 */
export function normalizeProgressSteps(str: string): string {
	return str.replace(/Uploading... \(\d\/\d\)\r?\n?/g, "");
}
