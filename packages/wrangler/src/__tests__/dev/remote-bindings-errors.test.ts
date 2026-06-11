import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { assert, beforeEach, describe, it, vi } from "vitest";
import { startRemoteProxySession } from "../../api";
import {
	createPreviewSession,
	createWorkerPreview,
} from "../../dev/create-worker-preview";
import { mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { msw, mswSuccessUserHandlers } from "../helpers/msw";
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

		// UserErrors (like auth/account selection failures) are re-thrown
		// directly without being wrapped in a generic "Failed to start the
		// remote proxy session" envelope, so the user sees a single,
		// actionable error message.
		expect(thrownError.message).toContain(
			"More than one account available but unable to select one in non-interactive mode."
		);
	});

	it("errors triggered when establishing the remote proxy session (after it has been created) are surfaced", async ({
		expect,
	}) => {
		vi.mocked(createPreviewSession).mockResolvedValue({
			value: "test-session-value",
			host: "test.workers.dev",
			name: "test",
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
			`[Error: Failed to start the remote proxy session. Failed to obtain a preview token: The remote worker preview failed.]`
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
