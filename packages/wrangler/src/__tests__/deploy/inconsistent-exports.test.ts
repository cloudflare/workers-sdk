import { renderInconsistentExportsAcrossVersionsError } from "@cloudflare/deploy-helpers";
import { describe, it } from "vitest";

describe("renderInconsistentExportsAcrossVersionsError", () => {
	it("preserves the server message and appends actionable next-steps", ({
		expect,
	}) => {
		const out = renderInconsistentExportsAcrossVersionsError(
			"All versions in a multi-version deployment must declare identical `exports`. Deploy the version that changes `exports` at 100% first, then split traffic."
		);

		expect(out).toMatchInlineSnapshot(`
			"All versions in a multi-version deployment must declare identical \`exports\`. Deploy the version that changes \`exports\` at 100% first, then split traffic.

			All versions in a percentage-split deployment must declare identical Durable Object \`exports\`. Cloudflare requires this so traffic on one branch can't route to code referencing unprovisioned or just-deleted DO namespaces.

			What to do:
			  1. Deploy the version that changes \`exports\` at 100% first:
			       wrangler versions deploy <new-version-id>@100%
			  2. Once that deploy is stable, run your percentage-split deploy.

			Learn more: https://developers.cloudflare.com/workers/configuration/versions-and-deployments/gradual-deployments/#gradual-deployments-for-durable-objects"
		`);
	});

	it("includes the server message verbatim at the top of the rendered output", ({
		expect,
	}) => {
		const serverMessage = "Custom server message about exports mismatch.";
		const out = renderInconsistentExportsAcrossVersionsError(serverMessage);

		// The server message is preserved as the first line so callers see EWC's
		// own explanation before our suggested next-steps.
		expect(out.startsWith(serverMessage)).toBe(true);
	});

	it("links to the gradual-deployments docs page for Durable Objects", ({
		expect,
	}) => {
		const out = renderInconsistentExportsAcrossVersionsError("anything");

		expect(out).toContain(
			"https://developers.cloudflare.com/workers/configuration/versions-and-deployments/gradual-deployments/#gradual-deployments-for-durable-objects"
		);
	});
});
