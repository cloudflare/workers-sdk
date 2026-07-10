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

	it("errors triggered when creating the remote proxy session are surfaced", async ({
		expect,
	}) => {
		let thrownError: Error | undefined;

		try {
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

		// UserErrors (like auth/account selection failures) are re-thrown
		// directly without being wrapped in a generic "Failed to start the
		// remote proxy session" envelope, so the user sees a single,
		// actionable error message.
		expect(thrownError.message).toContain(
			"More than one account available but unable to select one in non-interactive mode."
		);
	});
});
