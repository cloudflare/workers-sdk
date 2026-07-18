/**
 * Build the user-facing error message for EWC code 100405
 * (inconsistent declarative DO `exports` across versions in a
 * percentage-split deployment).
 *
 * The server's own message is already actionable; we augment it with a
 * concrete next-step that points back at `wrangler versions deploy` and a
 * link to the gradual-deployments docs.
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
		"       wrangler versions deploy <new-version-id>@100%",
		"  2. Once that deploy is stable, run your percentage-split deploy.",
		"",
		"Learn more: https://developers.cloudflare.com/workers/configuration/versions-and-deployments/gradual-deployments/#gradual-deployments-for-durable-objects",
	].join("\n");
}
