import {
	runInTempDir,
	writeWranglerConfig,
} from "@cloudflare/workers-utils/test-helpers";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { clearOutputFilePath } from "../../output";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { clearDialogs } from "../helpers/mock-dialogs";
import { mockUploadWorkerRequest } from "../helpers/mock-upload-worker";
import { mockGetSettings } from "../helpers/mock-worker-settings";
import { createFetchResult, msw } from "../helpers/msw";
import { runWrangler } from "../helpers/run-wrangler";
import { writeWorkerSource } from "../helpers/write-worker-source";
import {
	mockDeploymentsListRequest,
	mockLastDeploymentRequest,
	mockPatchScriptSettings,
} from "./helpers";

describe("deploy metrics export", () => {
	mockAccountId();
	mockApiToken();
	runInTempDir();
	mockConsoleMethods();

	beforeEach(() => {
		vi.stubGlobal("setTimeout", (fn: () => void) => {
			setImmediate(fn);
		});
		mockLastDeploymentRequest();
		mockDeploymentsListRequest();
		mockPatchScriptSettings();
		mockGetSettings();
		msw.use(
			http.get(
				"*/accounts/:accountId/workers/scripts/:scriptName/secrets",
				() => HttpResponse.json(createFetchResult([]))
			)
		);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		clearDialogs();
		clearOutputFilePath();
	});

	it("reconciles the Worker self-resource when metrics export is enabled", async ({
		expect,
	}) => {
		writeWranglerConfig({
			observability: {
				metrics: {
					enabled: true,
					destinations: ["opentelemetry-metrics"],
				},
			},
		});
		writeWorkerSource();
		mockUploadWorkerRequest({ expectedObservability: undefined });

		let requestBody: unknown;
		msw.use(
			http.get(
				"*/accounts/:accountId/workers/services/:scriptName",
				({ params }) => {
					return HttpResponse.json(
						createFetchResult({
							default_environment: {
								script: {
									id: "worker-script-id",
									last_deployed_from: "wrangler",
									tag: `tag:${params["scriptName"]}`,
								},
							},
						})
					);
				}
			),
			http.post(
				"*/accounts/:accountId/workers/observability/metricsexport",
				async ({ params, request }) => {
					expect(params.accountId).toEqual("some-account-id");
					requestBody = await request.json();
					return HttpResponse.json(createFetchResult({}));
				}
			)
		);

		await runWrangler("deploy");

		expect(requestBody).toEqual({
			requester: {
				requesterType: "workers",
				requesterId: "test-name",
			},
			resources: [
				{
					resourceType: "workers",
					resourceId: "worker-script-id",
					meta: "self",
					destinations: ["opentelemetry-metrics"],
				},
			],
		});
	});

	it("removes requester resources when metrics export is disabled", async ({
		expect,
	}) => {
		writeWranglerConfig({
			observability: {
				metrics: {
					enabled: false,
				},
			},
		});
		writeWorkerSource();
		mockUploadWorkerRequest({ expectedObservability: undefined });

		let requestBody: unknown;
		msw.use(
			http.post(
				"*/accounts/:accountId/workers/observability/metricsexport",
				async ({ request }) => {
					requestBody = await request.json();
					return HttpResponse.json(createFetchResult({}));
				}
			)
		);

		await runWrangler("deploy");

		expect(requestBody).toEqual({
			requester: {
				requesterType: "workers",
				requesterId: "test-name",
			},
			resources: [],
		});
	});

	it("does not reconcile when metrics export config is absent", async ({
		expect,
	}) => {
		writeWranglerConfig();
		writeWorkerSource();
		mockUploadWorkerRequest();

		let called = false;
		msw.use(
			http.post(
				"*/accounts/:accountId/workers/observability/metricsexport",
				() => {
					called = true;
					return HttpResponse.json(createFetchResult({}));
				}
			)
		);

		await runWrangler("deploy");

		expect(called).toBe(false);
	});
});
