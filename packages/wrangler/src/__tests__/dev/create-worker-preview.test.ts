import { COMPLIANCE_REGION_CONFIG_UNKNOWN } from "@cloudflare/workers-utils";
import { http, HttpResponse } from "msw";
import { createPreviewSession } from "../../dev/create-worker-preview";
import { mockApiToken } from "../helpers/mock-account-id";
import { createFetchResult, msw } from "../helpers/msw";

describe("createPreviewSession", () => {
	mockApiToken();

	it("creates account previews through the Worker-scoped endpoint", async ({
		expect,
	}) => {
		let requestedWorker: string | undefined;
		let requestedAccountSubdomain = false;
		msw.use(
			http.get(
				"*/accounts/test-account-id/workers/scripts/:worker/subdomain/edge-preview",
				({ params }) => {
					requestedWorker = params.worker as string;
					return HttpResponse.json(
						createFetchResult({
							token: "test-session-token",
							exchange_url:
								"https://preview-token.test-subdomain.workers.dev/cdn-cgi/workers/preview/",
						})
					);
				}
			),
			http.get("*/accounts/test-account-id/workers/subdomain", () => {
				requestedAccountSubdomain = true;
				return HttpResponse.json(
					createFetchResult(null, false, [
						{ code: 10000, message: "Authentication error" },
					]),
					{ status: 403 }
				);
			}),
			http.get(
				"https://preview-token.test-subdomain.workers.dev/cdn-cgi/workers/preview/",
				() => new HttpResponse(null, { status: 500 })
			)
		);

		const session = await createPreviewSession(
			COMPLIANCE_REGION_CONFIG_UNKNOWN,
			{
				accountId: "test-account-id",
				apiToken: { apiToken: "test-api-token" },
			},
			{
				env: undefined,
				zone: undefined,
				host: undefined,
				routes: undefined,
				sendMetrics: undefined,
			},
			new AbortController().signal,
			"test-worker"
		);

		expect(requestedWorker).toBe("test-worker");
		expect(requestedAccountSubdomain).toBe(false);
		expect(session).toEqual({
			value: "test-session-token",
			host: "test-worker.test-subdomain.workers.dev",
			name: "test-worker",
		});
	});
});
