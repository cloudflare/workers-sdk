import type { CodemodFollowUp, CodemodResult } from "./types";

/** Returns the final CLI summary for a codemod result. */
export function getCodemodSummary(
	result: CodemodResult,
	dryRun: boolean
): string {
	if (result.status === "skipped") {
		return `Skipped: ${result.message ?? "The codemod did not run."}`;
	}
	if (result.changedFiles.length === 0) {
		return "Project is already up to date.";
	}
	if (dryRun) {
		return `Would update ${result.changedFiles.length} file(s).`;
	}
	return `Updated ${result.changedFiles.length} file(s). Run your package manager's install command to refresh its lockfile.`;
}

/** Returns a failing exit code when a codemod requires manual intervention. */
export function getCodemodExitCode(status: CodemodResult["status"]): 0 | 1 {
	return status === "needs-intervention" ? 1 : 0;
}

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
