import { assert, beforeEach, describe, it, vi } from "vitest";
import { startRemoteProxySession } from "../../api";
import {
	createPreviewSession,
	createWorkerPreview,
} from "../../dev/create-worker-preview";
import { mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { msw, mswSuccessUserHandlers } from "../helpers/msw";
import { runInTempDir } from "../helpers/run-in-tmp";

vi.mock("../../dev/create-worker-preview", () => ({
	createPreviewSession: vi.fn(),
	createWorkerPreview: vi.fn(),
}));

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

		expect(thrownError.message).toContain(
			"Failed to start the remote proxy session"
		);

		// The issue here is that with the test setup there is more than one account available (but we're
		// in non-interactive mode). Here we make sure that this information is presented in the thrown error
		expect(thrownError.message).toContain(
			"More than one account available but unable to select one in non-interactive mode."
		);
	});

	it("errors triggered when establishing the remote proxy session (after it has been created) are surfaced", async ({
		expect,
	}) => {
		vi.mocked(createPreviewSession).mockResolvedValue({
			id: "test-session-id",
			value: "test-session-value",
			host: "test.workers.dev",
			prewarmUrl: new URL("https://test.workers.dev/prewarm"),
		});

		vi.mocked(createWorkerPreview).mockImplementation(async () => {
			throw new Error("The remote worker preview failed.");
		});

		let thrownError: Error | undefined;

		try {
			await startRemoteProxySession(
				{},
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

		expect(thrownError).toMatchInlineSnapshot(
			`[Error: Failed to start the remote proxy session. There is likely additional logging output above.]`
		);

		expect(thrownError.cause).toMatchInlineSnapshot(`
			{
			  "cause": [Error: The remote worker preview failed.],
			  "data": undefined,
			  "reason": "Failed to obtain a preview token",
			  "source": "RemoteRuntimeController",
			  "type": "error",
			}
		`);
	});
});
