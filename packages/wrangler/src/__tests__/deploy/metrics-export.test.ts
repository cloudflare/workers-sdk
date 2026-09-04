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
import { mockSubDomainRequest } from "../helpers/mock-workers-subdomain";
import { createFetchResult, msw } from "../helpers/msw";
import { mswListNewDeploymentsLatestFull } from "../helpers/msw/handlers/versions";
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
	const std = mockConsoleMethods();

	beforeEach(() => {
		vi.stubGlobal("setTimeout", (fn: () => void) => {
			setImmediate(fn);
		});
		mockLastDeploymentRequest();
		mockDeploymentsListRequest();
		mockPatchScriptSettings();
		mockGetSettings();
		mockSubDomainRequest();
		msw.use(...mswListNewDeploymentsLatestFull);
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

	function mockExistingWorker() {
		msw.use(
			http.get("*/accounts/:accountId/workers/services/:scriptName", () =>
				HttpResponse.json(
					createFetchResult({
						default_environment: {
							environment: "production",
							script: {
								tag: "existing-tag",
								tags: null,
								last_deployed_from: "wrangler",
							},
						},
					})
				)
			)
		);
	}

	it("reconciles Worker, D1, and R2 resources using canonical identities", async ({
		expect,
	}) => {
		writeWranglerConfig({
			main: "./index.js",
			d1_databases: [
				{
					binding: "DB_ONE",
					database_id: "11111111-1111-1111-1111-111111111111",
				},
				{
					binding: "DB_ALIAS",
					database_id: "11111111-1111-1111-1111-111111111111",
				},
			],
			r2_buckets: [
				{ binding: "BUCKET_ONE", bucket_name: "bucket-one" },
				{ binding: "BUCKET_ALIAS", bucket_name: "bucket-one" },
			],
			observability: {
				metrics: {
					enabled: true,
					destinations: ["opentelemetry-metrics"],
				},
			},
		});
		writeWorkerSource();
		mockUploadWorkerRequest({ expectedObservability: undefined });
		msw.use(
			http.get("*/accounts/:accountId/r2/buckets/:bucketName", () =>
				HttpResponse.json(
					createFetchResult({
						name: "bucket-one",
						creation_date: "2026-01-01T00:00:00Z",
					})
				)
			)
		);

		let requestBody: unknown;
		msw.use(
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
					resourceId: "test-name",
					destinations: ["opentelemetry-metrics"],
				},
				{
					resourceType: "d1",
					resourceId: "11111111-1111-1111-1111-111111111111",
					destinations: ["opentelemetry-metrics"],
				},
				{
					resourceType: "r2",
					resourceId: "bucket-one",
					destinations: ["opentelemetry-metrics"],
				},
			],
		});
	});

	it("resolves inherited D1 and R2 identities from deployed settings", async ({
		expect,
	}) => {
		writeWranglerConfig({
			main: "./index.js",
			d1_databases: [{ binding: "DB" }],
			r2_buckets: [{ binding: "BUCKET" }],
			observability: {
				metrics: {
					enabled: true,
					destinations: ["destination"],
				},
			},
		});
		writeWorkerSource();
		mockGetSettings({
			result: {
				bindings: [
					{ type: "d1", name: "DB", id: "remote-database-id" },
					{
						type: "r2_bucket",
						name: "BUCKET",
						bucket_name: "remote-bucket-name",
					},
				],
			},
		});
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
			resources: [
				{
					resourceType: "workers",
					resourceId: "test-name",
					destinations: ["destination"],
				},
				{
					resourceType: "d1",
					resourceId: "remote-database-id",
					destinations: ["destination"],
				},
				{
					resourceType: "r2",
					resourceId: "remote-bucket-name",
					destinations: ["destination"],
				},
			],
		});
	});

	it("discovers D1 and R2 resources selected during provisioning", async ({
		expect,
	}) => {
		writeWranglerConfig({
			main: "./index.js",
			d1_databases: [{ binding: "DB" }],
			r2_buckets: [{ binding: "BUCKET" }],
			observability: {
				metrics: { enabled: true, destinations: ["destination"] },
			},
		});
		writeWorkerSource();
		msw.use(
			http.get("*/accounts/:accountId/d1/database", () =>
				HttpResponse.json(
					createFetchResult([{ name: "database", uuid: "provisioned-d1-id" }])
				)
			),
			http.get("*/accounts/:accountId/r2/buckets", () =>
				HttpResponse.json(
					createFetchResult({
						buckets: [{ name: "provisioned-r2-bucket" }],
					})
				)
			),
			http.post("*/accounts/:accountId/d1/database", () =>
				HttpResponse.json(
					createFetchResult({
						name: "test-name-d1",
						uuid: "provisioned-d1-id",
					})
				)
			),
			http.post("*/accounts/:accountId/r2/buckets", () =>
				HttpResponse.json(createFetchResult({}))
			)
		);
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

		expect(requestBody).toMatchObject({
			resources: [
				{ resourceType: "workers", resourceId: "test-name" },
				{ resourceType: "d1", resourceId: "provisioned-d1-id" },
				{ resourceType: "r2", resourceId: "test-name-bucket" },
			],
		});
	});

	it("uses the deployed script name for a named environment", async ({
		expect,
	}) => {
		writeWranglerConfig({
			main: "./index.js",
			env: {
				staging: {
					observability: {
						metrics: { enabled: true, destinations: ["destination"] },
					},
				},
			},
		});
		writeWorkerSource();
		mockExistingWorker();
		mockUploadWorkerRequest({
			env: "staging",
			expectedObservability: undefined,
		});

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

		await runWrangler("deploy --env staging");

		expect(requestBody).toMatchObject({
			requester: {
				requesterType: "workers",
				requesterId: "test-name-staging",
			},
			resources: [{ resourceType: "workers", resourceId: "test-name-staging" }],
		});
	});

	it("inherits top-level metrics for a named environment", async ({
		expect,
	}) => {
		writeWranglerConfig({
			main: "./index.js",
			observability: {
				metrics: { enabled: true, destinations: ["destination"] },
			},
			env: { staging: {} },
		});
		writeWorkerSource();
		mockExistingWorker();
		mockUploadWorkerRequest({
			env: "staging",
			expectedObservability: undefined,
		});

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

		await runWrangler("deploy --env staging");

		expect(requestBody).toEqual({
			requester: {
				requesterType: "workers",
				requesterId: "test-name-staging",
			},
			resources: [
				{
					resourceType: "workers",
					resourceId: "test-name-staging",
					destinations: ["destination"],
				},
			],
		});
	});

	it("uses environment metrics and bindings instead of top-level values", async ({
		expect,
	}) => {
		writeWranglerConfig({
			main: "./index.js",
			d1_databases: [{ binding: "DB", database_id: "top-level-database" }],
			observability: {
				metrics: { enabled: true, destinations: ["top-level-destination"] },
			},
			env: {
				staging: {
					d1_databases: [{ binding: "DB", database_id: "staging-database" }],
					r2_buckets: [{ binding: "BUCKET", bucket_name: "staging-bucket" }],
					observability: {
						metrics: {
							enabled: true,
							destinations: ["staging-destination"],
						},
					},
				},
			},
		});
		writeWorkerSource();
		mockExistingWorker();
		mockUploadWorkerRequest({
			env: "staging",
			expectedObservability: undefined,
		});
		msw.use(
			http.get("*/accounts/:accountId/r2/buckets/:bucketName", () =>
				HttpResponse.json(
					createFetchResult({
						name: "staging-bucket",
						creation_date: "2026-01-01T00:00:00Z",
					})
				)
			)
		);

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

		await runWrangler("deploy --env staging");

		expect(requestBody).toEqual({
			requester: {
				requesterType: "workers",
				requesterId: "test-name-staging",
			},
			resources: [
				{
					resourceType: "workers",
					resourceId: "test-name-staging",
					destinations: ["staging-destination"],
				},
				{
					resourceType: "d1",
					resourceId: "staging-database",
					destinations: ["staging-destination"],
				},
				{
					resourceType: "r2",
					resourceId: "staging-bucket",
					destinations: ["staging-destination"],
				},
			],
		});
	});

	it("preserves metrics export during skipped Container rollout with no local Containers", async ({
		expect,
	}) => {
		writeWranglerConfig({
			main: "./index.js",
			observability: {
				metrics: { enabled: true, destinations: ["destination"] },
			},
		});
		writeWorkerSource();
		mockUploadWorkerRequest({ expectedObservability: undefined });
		let reconciliationCalled = false;
		msw.use(
			http.post(
				"*/accounts/:accountId/workers/observability/metricsexport",
				() => {
					reconciliationCalled = true;
					return HttpResponse.json(createFetchResult({}));
				}
			)
		);

		await runWrangler("deploy --containers-rollout=none");

		expect(reconciliationCalled).toBe(false);
		expect(std.warn).toContain("metrics export was not reconciled");
	});

	it("clears only the selected environment requester when metrics is disabled", async ({
		expect,
	}) => {
		writeWranglerConfig({
			main: "./index.js",
			observability: {
				metrics: { enabled: true, destinations: ["destination"] },
			},
			env: {
				staging: {
					observability: { metrics: { enabled: false } },
				},
			},
		});
		writeWorkerSource();
		mockExistingWorker();
		mockUploadWorkerRequest({
			env: "staging",
			expectedObservability: undefined,
		});

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

		await runWrangler("deploy --env staging");

		expect(requestBody).toEqual({
			requester: {
				requesterType: "workers",
				requesterId: "test-name-staging",
			},
			resources: [],
		});
	});

	it("warns and skips reconciliation when environment observability shadows metrics", async ({
		expect,
	}) => {
		writeWranglerConfig({
			main: "./index.js",
			observability: {
				metrics: { enabled: true, destinations: ["destination"] },
			},
			env: {
				staging: {
					observability: { logs: { enabled: true } },
				},
			},
		});
		writeWorkerSource();
		mockExistingWorker();
		mockUploadWorkerRequest({
			env: "staging",
			expectedObservability: { logs: { enabled: true } },
		});

		let reconciliationCalled = false;
		msw.use(
			http.post(
				"*/accounts/:accountId/workers/observability/metricsexport",
				() => {
					reconciliationCalled = true;
					return HttpResponse.json(createFetchResult({}));
				}
			)
		);

		await runWrangler("deploy --env staging");

		expect(reconciliationCalled).toBe(false);
		expect(std.warn).toContain('"env.staging" environment configuration');
		expect(std.warn).toContain("Metrics export will not be reconciled.");
	});

	it("does not disable native observability for metrics-only config", async ({
		expect,
	}) => {
		writeWranglerConfig({
			main: "./index.js",
			observability: {
				metrics: { enabled: true, destinations: ["destination"] },
			},
		});
		writeWorkerSource();
		mockUploadWorkerRequest({ expectedObservability: undefined });
		const settingsPatches: unknown[] = [];
		msw.use(
			http.patch(
				"*/accounts/:accountId/workers/scripts/:scriptName/script-settings",
				async ({ request }) => {
					settingsPatches.push(await request.json());
					return HttpResponse.json(createFetchResult({}));
				}
			),
			http.post(
				"*/accounts/:accountId/workers/observability/metricsexport",
				() => HttpResponse.json(createFetchResult({}))
			)
		);

		await runWrangler("deploy");

		expect(settingsPatches).toHaveLength(1);
		expect(settingsPatches[0]).not.toHaveProperty("observability");
	});

	it("strips only metrics from native Worker observability settings", async ({
		expect,
	}) => {
		writeWranglerConfig({
			main: "./index.js",
			observability: {
				enabled: true,
				head_sampling_rate: 0.5,
				metrics: { enabled: true, destinations: ["destination"] },
			},
		});
		writeWorkerSource();
		mockUploadWorkerRequest({
			expectedObservability: { enabled: true, head_sampling_rate: 0.5 },
		});
		const settingsPatches: unknown[] = [];
		msw.use(
			http.patch(
				"*/accounts/:accountId/workers/scripts/:scriptName/script-settings",
				async ({ request }) => {
					settingsPatches.push(await request.json());
					return HttpResponse.json(createFetchResult({}));
				}
			),
			http.post(
				"*/accounts/:accountId/workers/observability/metricsexport",
				() => HttpResponse.json(createFetchResult({}))
			)
		);

		await runWrangler("deploy");

		expect(settingsPatches).toHaveLength(1);
		expect(settingsPatches[0]).toHaveProperty("observability", {
			enabled: true,
			head_sampling_rate: 0.5,
		});
		expect(settingsPatches[0]).not.toHaveProperty("observability.metrics");
	});

	it("preserves explicit native observability disable with metrics", async ({
		expect,
	}) => {
		writeWranglerConfig({
			main: "./index.js",
			observability: {
				enabled: false,
				metrics: { enabled: false },
			},
		});
		writeWorkerSource();
		mockUploadWorkerRequest({ expectedObservability: { enabled: false } });
		const settingsPatches: unknown[] = [];
		msw.use(
			http.patch(
				"*/accounts/:accountId/workers/scripts/:scriptName/script-settings",
				async ({ request }) => {
					settingsPatches.push(await request.json());
					return HttpResponse.json(createFetchResult({}));
				}
			),
			http.post(
				"*/accounts/:accountId/workers/observability/metricsexport",
				() => HttpResponse.json(createFetchResult({}))
			)
		);

		await runWrangler("deploy");

		expect(settingsPatches).toHaveLength(1);
		expect(settingsPatches[0]).toHaveProperty("observability", {
			enabled: false,
		});
		expect(settingsPatches[0]).not.toHaveProperty("observability.metrics");
	});

	it("ignores metrics export for dispatch namespace deployments", async ({
		expect,
	}) => {
		writeWranglerConfig({
			main: "./index.js",
			observability: {
				metrics: { enabled: true, destinations: ["destination"] },
			},
		});
		writeWorkerSource();
		mockUploadWorkerRequest({
			expectedDispatchNamespace: "customer-workers",
			expectedObservability: undefined,
		});
		let reconciliationCalled = false;
		msw.use(
			http.post(
				"*/accounts/:accountId/workers/observability/metricsexport",
				() => {
					reconciliationCalled = true;
					return HttpResponse.json(createFetchResult({}));
				}
			)
		);

		await runWrangler("deploy --dispatch-namespace customer-workers");
		expect(reconciliationCalled).toBe(false);
	});

	it("does not post a partial resource set when a binding is unresolved", async ({
		expect,
	}) => {
		writeWranglerConfig({
			main: "./index.js",
			d1_databases: [{ binding: "DB" }],
			observability: {
				metrics: { enabled: true, destinations: ["destination"] },
			},
		});
		writeWorkerSource();
		let settingsRequests = 0;
		msw.use(
			http.get(
				"*/accounts/:accountId/workers/scripts/:scriptName/settings",
				() => {
					settingsRequests += 1;
					return HttpResponse.json(
						createFetchResult({
							bindings:
								settingsRequests === 1
									? [{ type: "d1", name: "DB", id: "database-id" }]
									: [],
						})
					);
				}
			)
		);
		mockUploadWorkerRequest({ expectedObservability: undefined });

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
		expect(std.warn).toContain(
			"The Worker deployment succeeded, but Wrangler could not reconcile its metrics export configuration: Wrangler could not resolve the D1 resource used by binding DB."
		);
		expect(called).toBe(false);
	});

	it("does not post a partial resource set when an R2 binding is unresolved", async ({
		expect,
	}) => {
		writeWranglerConfig({
			main: "./index.js",
			r2_buckets: [{ binding: "BUCKET" }],
			observability: {
				metrics: { enabled: true, destinations: ["destination"] },
			},
		});
		writeWorkerSource();
		let settingsRequests = 0;
		msw.use(
			http.get(
				"*/accounts/:accountId/workers/scripts/:scriptName/settings",
				() => {
					settingsRequests += 1;
					return HttpResponse.json(
						createFetchResult({
							bindings:
								settingsRequests === 1
									? [
											{
												type: "r2_bucket",
												name: "BUCKET",
												bucket_name: "bucket-name",
											},
										]
									: [],
						})
					);
				}
			)
		);
		mockUploadWorkerRequest({ expectedObservability: undefined });

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
		expect(std.warn).toContain(
			"The Worker deployment succeeded, but Wrangler could not reconcile its metrics export configuration: Wrangler could not resolve the R2 resource used by binding BUCKET."
		);
		expect(called).toBe(false);
	});

	it("removes requester resources when metrics export is disabled", async ({
		expect,
	}) => {
		writeWranglerConfig({
			main: "./index.js",
			d1_databases: [{ binding: "DB" }],
			observability: {
				metrics: {
					enabled: false,
				},
			},
		});
		writeWorkerSource();
		let settingsRequests = 0;
		msw.use(
			http.get(
				"*/accounts/:accountId/workers/scripts/:scriptName/settings",
				() => {
					settingsRequests += 1;
					return HttpResponse.json(
						createFetchResult({
							bindings:
								settingsRequests === 1
									? [{ type: "d1", name: "DB", id: "database-id" }]
									: [],
						})
					);
				}
			)
		);
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

		await runWrangler("deploy --containers-rollout=none");

		expect(requestBody).toEqual({
			requester: {
				requesterType: "workers",
				requesterId: "test-name",
			},
			resources: [],
		});
		expect(settingsRequests).toBe(1);
	});

	it("does not reconcile when metrics export config is absent", async ({
		expect,
	}) => {
		writeWranglerConfig({ main: "./index.js" });
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

		await runWrangler("deploy --containers-rollout=none");

		expect(called).toBe(false);
		expect(std.warn).not.toContain("metrics export was not reconciled");
	});

	it("retries transient metrics export reconciliation failures", async ({
		expect,
	}) => {
		writeWranglerConfig({
			main: "./index.js",
			observability: {
				metrics: {
					enabled: false,
				},
			},
		});
		writeWorkerSource();
		mockUploadWorkerRequest({ expectedObservability: undefined });

		let attempts = 0;
		msw.use(
			http.post(
				"*/accounts/:accountId/workers/observability/metricsexport",
				() => {
					attempts += 1;
					return attempts < 3
						? HttpResponse.json(createFetchResult(null, false), { status: 500 })
						: HttpResponse.json(createFetchResult({}));
				}
			)
		);

		await runWrangler("deploy");

		expect(attempts).toBe(3);
	});

	it("warns after publishing triggers when metrics export reconciliation fails", async ({
		expect,
	}) => {
		writeWranglerConfig({
			main: "./index.js",
			triggers: { crons: ["*/5 * * * *"] },
			observability: {
				metrics: {
					enabled: false,
				},
			},
		});
		writeWorkerSource();
		mockUploadWorkerRequest({ expectedObservability: undefined });

		let attempts = 0;
		const calls: string[] = [];
		msw.use(
			http.put(
				"*/accounts/:accountId/workers/scripts/:scriptName/schedules",
				() => {
					calls.push("triggers");
					return HttpResponse.json(createFetchResult(null));
				}
			),
			http.post(
				"*/accounts/:accountId/workers/observability/metricsexport",
				() => {
					attempts += 1;
					calls.push("metrics");
					return HttpResponse.json(createFetchResult(null, false), {
						status: 500,
					});
				}
			)
		);

		await runWrangler("deploy");
		expect(std.warn).toContain(
			"The Worker deployment succeeded, but Wrangler could not reconcile its metrics export configuration. Retry the deployment to reconcile the configuration."
		);
		expect(attempts).toBe(3);
		expect(calls).toEqual(["triggers", "metrics", "metrics", "metrics"]);
	});
});
