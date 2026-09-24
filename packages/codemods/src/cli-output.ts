import type { CodemodFollowUp } from "./types";

/**
 * Formats migration follow-ups for terminal output.
 *
 * @param followUps Manual work reported by a codemod.
 * @returns Lines ready to print to stdout.
 */
export function formatFollowUps(
	followUps: readonly CodemodFollowUp[]
): string[] {
	if (followUps.length === 0) {
		return [];
	}

	const lines = ["Follow-up work:"];
	for (const followUp of followUps) {
		const severity = followUp.blocking ? "required" : "info";
		const source = followUp.sourcePath ? `${followUp.sourcePath}: ` : "";
		lines.push(`  - [${severity}] ${source}${followUp.message}`);
		if (followUp.docsUrl) {
			lines.push(`    ${followUp.docsUrl}`);
		}
	}

	return lines;
}
