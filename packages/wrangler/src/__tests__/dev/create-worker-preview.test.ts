import { COMPLIANCE_REGION_CONFIG_UNKNOWN } from "@cloudflare/workers-utils";
import { http, HttpResponse } from "msw";
import { describe, it } from "vitest";
import {
	createPreviewSession,
	createWorkerPreview,
} from "../../dev/create-worker-preview";
import { mockApiToken } from "../helpers/mock-account-id";
import { createFetchResult, msw } from "../helpers/msw";
import type { CfWorkerInitWithName } from "../../dev/remote";

describe("Worker-scoped preview sessions", () => {
	mockApiToken();

	it("uploads static assets without account-level subdomain access", async ({
		expect,
	}) => {
		let requestedAccountSubdomain = false;
		let uploadedMetadata: unknown;
		let uploadedSessionConfig: unknown;

		msw.use(
			http.get(
				"*/accounts/test-account-id/workers/scripts/:worker/subdomain/edge-preview",
				({ params }) => {
					expect(params.worker).toBe("test-worker");
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
			),
			http.post(
				"*/accounts/test-account-id/workers/scripts/test-worker/edge-preview",
				async ({ request }) => {
					expect(request.headers.get("cf-preview-upload-config-token")).toBe(
						"test-session-token"
					);
					// eslint-disable-next-line @typescript-eslint/no-deprecated -- formData() is the standard Web API for parsing multipart bodies; only deprecated on undici's server-side types
					const formData = await request.formData();
					uploadedMetadata = JSON.parse(String(formData.get("metadata")));
					uploadedSessionConfig = JSON.parse(
						String(formData.get("wrangler-session-config"))
					);
					return HttpResponse.json(
						createFetchResult({
							preview_token: "test-preview-token",
							tail_url: "https://tail.example.com",
						})
					);
				}
			)
		);

		const abortSignal = new AbortController().signal;
		const account = {
			accountId: "test-account-id",
			apiToken: { apiToken: "test-api-token" },
		};
		const context = {
			env: undefined,
			zone: undefined,
			host: undefined,
			routes: undefined,
			sendMetrics: undefined,
		};
		const session = await createPreviewSession(
			COMPLIANCE_REGION_CONFIG_UNKNOWN,
			account,
			context,
			abortSignal,
			"test-worker"
		);
		const worker: CfWorkerInitWithName = {
			name: "test-worker",
			main: {
				name: "index.mjs",
				filePath: undefined,
				type: "esm",
				content: "export default { fetch() {} }",
			},
			modules: [],
			bindings: {},
			sourceMaps: undefined,
			containers: undefined,
			migrations: undefined,
			exports: undefined,
			compatibility_date: "2026-09-02",
			compatibility_flags: [],
			keepVars: true,
			keepSecrets: true,
			logpush: false,
			placement: undefined,
			tail_consumers: undefined,
			limits: undefined,
			assets: {
				jwt: "test-assets-jwt",
				routerConfig: { has_user_worker: false },
				assetConfig: {},
			},
			observability: undefined,
			cache: undefined,
		};

		const preview = await createWorkerPreview(
			COMPLIANCE_REGION_CONFIG_UNKNOWN,
			worker,
			account,
			context,
			session,
			abortSignal
		);

		expect(requestedAccountSubdomain).toBe(false);
		expect(session).toEqual({
			value: "test-session-token",
			host: "test-worker.test-subdomain.workers.dev",
			name: "test-worker",
		});
		expect(uploadedMetadata).toEqual({
			assets: { jwt: "test-assets-jwt", config: {} },
			compatibility_date: "2026-09-02",
			compatibility_flags: [],
		});
		expect(uploadedSessionConfig).toEqual({ workers_dev: true });
		expect(preview).toEqual({
			value: "test-preview-token",
			host: "test-worker.test-subdomain.workers.dev",
			tailUrl: "https://tail.example.com",
		});
	});

	it("falls back to the account subdomain for legacy session responses", async ({
		expect,
	}) => {
		msw.use(
			http.get(
				"*/accounts/test-account-id/workers/scripts/test-worker/subdomain/edge-preview",
				() =>
					HttpResponse.json(createFetchResult({ token: "test-session-token" }))
			),
			http.get("*/accounts/test-account-id/workers/subdomain", () =>
				HttpResponse.json(createFetchResult({ subdomain: "test-subdomain" }))
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

		expect(session.host).toBe("test-worker.test-subdomain.workers.dev");
	});

	it("preserves the endpoint and host for zone previews", async ({
		expect,
	}) => {
		msw.use(
			http.get("*/zones/test-zone/workers/edge-preview", () =>
				HttpResponse.json(
					createFetchResult({
						token: "test-session-token",
						exchange_url:
							"https://preview-token.zone.example.com/cdn-cgi/workers/preview/",
					})
				)
			),
			http.get(
				"https://preview.example.com/cdn-cgi/workers/preview/",
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
				zone: "test-zone",
				host: "preview.example.com",
				routes: undefined,
				sendMetrics: undefined,
			},
			new AbortController().signal,
			"test-worker"
		);

		expect(session).toEqual({
			value: "test-session-token",
			host: "preview.example.com",
			name: "test-worker",
		});
	});
});
