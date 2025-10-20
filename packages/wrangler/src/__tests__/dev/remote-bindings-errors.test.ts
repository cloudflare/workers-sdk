import { beforeEach, describe, it } from "vitest";
import { startRemoteProxySession } from "../../api";
import { mockApiToken } from "../helpers/mock-account-id";
import { msw, mswSuccessUserHandlers } from "../helpers/msw";
import { runInTempDir } from "../helpers/run-in-tmp";

describe("errors during dev with remote bindings", () => {
	mockApiToken();
	runInTempDir();

	beforeEach(() => {
		msw.use(...mswSuccessUserHandlers);
	});

	it("errors when starting the remote proxy session are appropriately surfaced", async () => {
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

		expect(thrownError.message).toContain(
			"Failed to start the remote proxy session"
		);

		// The issue here is that with the test setup there is more than one account available (but we're
		// in non-interactive mode). Here we make sure that this information is presented in the thrown error
		expect(thrownError.message).toContain(
			"More than one account available but unable to select one in non-interactive mode."
		);
	});
});
