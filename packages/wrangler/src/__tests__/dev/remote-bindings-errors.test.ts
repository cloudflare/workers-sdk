import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { http, HttpResponse } from "msw";
import { assert, beforeEach, describe, it } from "vitest";
import { startRemoteProxySession } from "../../api";
import { mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { createFetchResult, msw, mswSuccessUserHandlers } from "../helpers/msw";

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
		msw.use(
			http.get(
				"*/accounts/test-account-id/workers/subdomain/edge-preview",
				() =>
					HttpResponse.json(createFetchResult({ token: "test-session-value" }))
			),
			http.get("*/accounts/test-account-id/workers/subdomain", () =>
				HttpResponse.json(createFetchResult({ subdomain: "test" }))
			),
			http.post(
				"*/accounts/test-account-id/workers/scripts/:scriptName/edge-preview",
				() =>
					HttpResponse.json(
						createFetchResult({}, false, [
							{ code: 1000, message: "The remote worker preview failed." },
						]),
						{ status: 400 }
					)
			)
		);

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

		expect(thrownError.message).toContain(
			"Failed to start the remote proxy session. Failed to obtain a preview token"
		);
		expect(thrownError.cause).toMatchObject({
			reason: "Failed to obtain a preview token",
			type: "error",
		});
	});
});
