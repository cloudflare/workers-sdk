import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { assert, beforeEach, describe, it } from "vitest";
import { startRemoteProxySession } from "../../api";
import { mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { msw, mswSuccessUserHandlers } from "../helpers/msw";

mockConsoleMethods();

describe("errors during dev with remote bindings", () => {
	mockApiToken();
	runInTempDir();

	beforeEach(() => {
		msw.use(...mswSuccessUserHandlers);
	});

	it("re-throws auth/account-selection UserErrors directly (not wrapped)", async ({
		expect,
	}) => {
		let thrownError: Error | undefined;

		try {
			// No `auth` provided, so wrangler resolves credentials via its own auth
			// system. With multiple accounts available and no interactive prompt,
			// account selection fails with a UserError that must be surfaced
			// directly rather than wrapped in a generic "Failed to start" envelope.
			await startRemoteProxySession({
				MY_WORKER: {
					type: "service",
					service: "my-worker",
					remote: true,
				},
			});
		} catch (e) {
			assert(e instanceof Error);
			thrownError = e;
		}

		assert(thrownError);
		expect(thrownError.message).toContain(
			"More than one account available but unable to select one in non-interactive mode."
		);
	});

	it("surfaces edge-preview API failures", async ({ expect }) => {
		let thrownError: Error | undefined;

		try {
			// Explicit auth bypasses account selection, so the session proceeds to
			// the edge-preview API call. With no handler registered for that
			// endpoint the request fails, and the actionable Cloudflare API error
			// is surfaced directly.
			await startRemoteProxySession(
				{
					MY_WORKER: {
						type: "service",
						service: "my-worker",
						remote: true,
					},
				},
				{
					auth: {
						accountId: "test-account-id",
						apiToken: { apiToken: "test-token" },
					},
				}
			);
		} catch (e) {
			assert(e instanceof Error);
			thrownError = e;
		}

		assert(thrownError);
		expect(thrownError.message).toContain("A request to the Cloudflare API");
		expect(thrownError.message).toContain("workers/subdomain/edge-preview");
	});
});
