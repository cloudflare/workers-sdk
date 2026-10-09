import { cliPresentation } from "../../shared/context";

/**
 * Build the user-facing error message for EWC code 100405
 * (inconsistent declarative DO `exports` across versions in a
 * percentage-split deployment).
 *
 * The server's own message is already actionable; we augment it with a
 * concrete CLI-specific next step and a link to the gradual-deployments docs.
 *
 * @param serverMessage Error message returned by the deployment API.
 * @returns The server message followed by consumer-specific recovery guidance.
 */
export function renderInconsistentExportsAcrossVersionsError(
	serverMessage: string
): string {
	return [
		serverMessage,
		"",
		"All versions in a percentage-split deployment must declare identical Durable Object `exports`. Cloudflare requires this so traffic on one branch can't route to code referencing unprovisioned or just-deleted DO namespaces.",
		"",
		"What to do:",
		"  1. Deploy the version that changes `exports` at 100% first:",
		`       ${cliPresentation.commands.versionsDeployAt(100)}`,
		"  2. Once that deploy is stable, run your percentage-split deploy.",
		"",
		"Learn more: https://developers.cloudflare.com/workers/configuration/versions-and-deployments/gradual-deployments/#gradual-deployments-for-durable-objects",
	].join("\n");
}
