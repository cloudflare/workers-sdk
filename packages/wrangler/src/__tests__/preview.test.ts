import { mkdirSync, writeFileSync } from "node:fs";
import { defaultWranglerConfig } from "@cloudflare/workers-utils";
import { http, HttpResponse } from "msw";
import { afterAll, beforeEach, describe, test, vi } from "vitest";
import { extractConfigBindings, getBranchName } from "../preview/shared";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { useMockStdin } from "./helpers/mock-stdin";
import { msw } from "./helpers/msw";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import type { Config, PreviewsConfig } from "@cloudflare/workers-utils";

function configWithPreviews(previews: Partial<PreviewsConfig>): Config {
	return {
		...defaultWranglerConfig,
		previews: previews as PreviewsConfig,
	};
}

describe("wrangler preview", () => {
	const std = mockConsoleMethods();
	runInTempDir();
	mockApiToken();
	mockAccountId();

	describe("getBranchName", () => {
		beforeEach(() => {
			vi.unstubAllEnvs();
			vi.stubEnv("WORKERS_CI_BRANCH", undefined);
			vi.stubEnv("GITHUB_REF_NAME", undefined);
			vi.stubEnv("GITHUB_HEAD_REF", undefined);
			vi.stubEnv("CI_COMMIT_REF_NAME", undefined);
		});

		afterAll(() => {
			vi.unstubAllEnvs();
		});

		test("should prefer the Workers CI branch env var", ({ expect }) => {
			vi.stubEnv("WORKERS_CI_BRANCH", "workers-build-branch");
			vi.stubEnv("GITHUB_REF_NAME", "github-branch");
			vi.stubEnv("GITHUB_HEAD_REF", "github-head-branch");
			vi.stubEnv("CI_COMMIT_REF_NAME", "gitlab-branch");

			expect(getBranchName()).toBe("workers-build-branch");
		});

		test("should use the GitHub Actions branch env vars", ({ expect }) => {
			vi.stubEnv("GITHUB_HEAD_REF", "github-pr-branch");
			expect(getBranchName()).toBe("github-pr-branch");

			vi.stubEnv("GITHUB_HEAD_REF", undefined);
			vi.stubEnv("GITHUB_REF_NAME", "github-push-branch");
			expect(getBranchName()).toBe("github-push-branch");
		});

		test("should use the GitLab branch env var", ({ expect }) => {
			vi.stubEnv("CI_COMMIT_REF_NAME", "gitlab-branch");

			expect(getBranchName()).toBe("gitlab-branch");
		});
	});

	describe("extractConfigBindings", () => {
		test("should extract vars as plain_text bindings", ({ expect }) => {
			const config = configWithPreviews({
				vars: { VAR1: "value1", VAR2: "value2" },
			});
			const bindings = extractConfigBindings(config);
			expect(bindings).toMatchObject({
				VAR1: { type: "plain_text", text: "value1" },
				VAR2: { type: "plain_text", text: "value2" },
			});
		});

		test("should extract kv_namespaces", ({ expect }) => {
			const config = configWithPreviews({
				kv_namespaces: [{ binding: "MY_KV", id: "kv-id-123" }],
			});
			const bindings = extractConfigBindings(config);
			expect(bindings).toMatchObject({
				MY_KV: { type: "kv_namespace", namespace_id: "kv-id-123" },
			});
		});

		test("should extract d1_databases", ({ expect }) => {
			const config = configWithPreviews({
				d1_databases: [
					{ binding: "DB", database_id: "db-id-123", database_name: "my-db" },
				],
			});
			const bindings = extractConfigBindings(config);
			expect(bindings).toMatchObject({
				DB: { type: "d1", database_id: "db-id-123", database_name: "my-db" },
			});
		});

		test("should extract r2_buckets", ({ expect }) => {
			const config = configWithPreviews({
				r2_buckets: [{ binding: "BUCKET", bucket_name: "my-bucket" }],
			});
			const bindings = extractConfigBindings(config);
			expect(bindings).toMatchObject({
				BUCKET: { type: "r2_bucket", bucket_name: "my-bucket" },
			});
		});

		test("should extract services", ({ expect }) => {
			const config = configWithPreviews({
				services: [
					{ binding: "API", service: "api-worker", entrypoint: "default" },
				],
			});
			const bindings = extractConfigBindings(config);
			expect(bindings).toMatchObject({
				API: { type: "service", service: "api-worker", entrypoint: "default" },
			});
		});

		test("should extract durable_objects bindings", ({ expect }) => {
			const config = configWithPreviews({
				durable_objects: {
					bindings: [
						{
							name: "COUNTER",
							class_name: "Counter",
							script_name: "counter-worker",
						},
					],
				},
			});
			const bindings = extractConfigBindings(config);
			expect(bindings).toMatchObject({
				COUNTER: {
					type: "durable_object_namespace",
					class_name: "Counter",
					script_name: "counter-worker",
				},
			});
		});

		test("should return empty object when no previews block", ({ expect }) => {
			const config = { ...defaultWranglerConfig, previews: undefined };
			const bindings = extractConfigBindings(config);
			expect(bindings).toEqual({});
		});

		test("should extract multiple binding types", ({ expect }) => {
			const config = configWithPreviews({
				vars: { MY_VAR: "value" },
				kv_namespaces: [{ binding: "MY_KV", id: "kv-123" }],
				d1_databases: [
					{ binding: "MY_DB", database_id: "db-123", database_name: "test" },
				],
			});
			const bindings = extractConfigBindings(config);
			expect(Object.values(bindings).map((b) => b.type)).toEqual([
				"plain_text",
				"kv_namespace",
				"d1",
			]);
		});

		test("should extract additional supported preview binding types", ({
			expect,
		}) => {
			const config = configWithPreviews({
				queues: {
					producers: [{ binding: "MY_QUEUE", queue: "queue-name" }],
				},
				vectorize: [{ binding: "MY_VECTOR", index_name: "idx" }],
				hyperdrive: [{ binding: "MY_HYPERDRIVE", id: "hyper-id" }],
				analytics_engine_datasets: [
					{ binding: "MY_AE", dataset: "dataset-name" },
				],
				browser: { binding: "MY_BROWSER" },
				version_metadata: { binding: "MY_VERSION_METADATA" },
			});
			const bindings = extractConfigBindings(config);
			expect(bindings).toMatchObject({
				MY_QUEUE: { type: "queue", queue_name: "queue-name" },
				MY_VECTOR: { type: "vectorize", index_name: "idx" },
				MY_HYPERDRIVE: { type: "hyperdrive", id: "hyper-id" },
				MY_AE: { type: "analytics_engine", dataset: "dataset-name" },
				MY_BROWSER: { type: "browser" },
				MY_VERSION_METADATA: { type: "version_metadata" },
			});
		});
	});

	describe("preview command", () => {
		beforeEach(() => {
			mkdirSync("src", { recursive: true });
			writeFileSync(
				"src/index.ts",
				"export default { fetch() { return new Response('ok'); } };"
			);
			writeFileSync(
				"wrangler.json",
				JSON.stringify({
					name: "test-worker",
					main: "src/index.ts",
					compatibility_date: "2025-01-01",
					previews: {
						vars: { ENVIRONMENT: "preview" },
						kv_namespaces: [{ binding: "MY_KV", id: "preview-kv-id" }],
					},
				})
			);
			msw.resetHandlers();
			msw.use(
				http.get(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments/latest`,
					() =>
						HttpResponse.json(
							{
								success: false,
								result: null,
								errors: [
									{ code: 10025, message: "Preview deployment not found" },
								],
							},
							{ status: 404 }
						)
				)
			);
		});

		test("should create a new preview with defaults applied", async ({
			expect,
		}) => {
			let lookupPreviewUrl: string | undefined;
			msw.use(
				http.get(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId`,
					({ request }) => {
						lookupPreviewUrl = request.url;
						return HttpResponse.json(
							{
								success: false,
								result: null,
								errors: [{ code: 10025, message: "Preview not found" }],
							},
							{ status: 404 }
						);
					}
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews`,
					() => {
						return HttpResponse.json(
							{
								success: true,
								result: {
									id: "preview-id-123",
									name: "test-preview",
									slug: "test-preview",
									urls: ["https://test-preview.test-worker.cloudflare.app"],
									worker_name: "test-worker",
									observability: { enabled: true, head_sampling_rate: 0.5 },
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						);
					}
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments`,
					() => {
						return HttpResponse.json(
							{
								success: true,
								result: {
									id: "deployment-id-123",
									preview_id: "preview-id-123",
									preview_name: "test-preview",
									urls: ["https://abc12345.test-worker.cloudflare.app"],
									compatibility_date: "2025-01-01",
									env: {
										DEFAULT_VAR: { type: "plain_text", text: "from-defaults" },
										ENVIRONMENT: { type: "plain_text", text: "preview" },
										MY_KV: {
											type: "kv_namespace",
											namespace_id: "preview-kv-id",
										},
									},
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						);
					}
				)
			);

			await runWrangler(
				"preview --name test-preview --worker-name override-worker"
			);
			expect(lookupPreviewUrl).toContain(
				"/workers/workers/override-worker/previews/"
			);
			expect(std.out).toContain("Preview: test-preview (new)");
			expect(std.out).toContain("Deployment:");
			expect(std.out).toContain("DEFAULT_VAR");
			expect(std.out).toContain('"from-defaults"');
			expect(std.out).toContain("◆ from wrangler.json");
		});

		test("should output preview and deployment JSON with --json", async ({
			expect,
		}) => {
			msw.use(
				http.get(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId`,
					() =>
						HttpResponse.json(
							{
								success: false,
								result: null,
								errors: [{ code: 10025, message: "Preview not found" }],
							},
							{ status: 404 }
						)
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews`,
					() =>
						HttpResponse.json(
							{
								success: true,
								result: {
									id: "preview-id-json",
									name: "test-preview",
									slug: "test-preview",
									urls: ["https://test-preview.test-worker.cloudflare.app"],
									worker_name: "test-worker",
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						)
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments`,
					() =>
						HttpResponse.json(
							{
								success: true,
								result: {
									id: "deployment-id-json",
									preview_id: "preview-id-json",
									preview_name: "test-preview",
									urls: ["https://json123.test-worker.cloudflare.app"],
									compatibility_date: "2025-01-01",
									env: {},
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						)
				)
			);

			await runWrangler("preview --name test-preview --json");

			expect(std.out).toContain('"preview"');
			expect(std.out).toContain('"deployment"');
			expect(std.out).toContain('"id": "preview-id-json"');
			expect(std.out).toContain('"id": "deployment-id-json"');
			expect(std.out).not.toContain("Preview: test-preview");
			expect(std.out).not.toContain("Deployment:");
		});

		test("should show existing preview status for existing preview", async ({
			expect,
		}) => {
			msw.use(
				http.get(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId`,
					() => {
						return HttpResponse.json({
							success: true,
							result: {
								id: "existing-preview-id",
								name: "test-preview",
								slug: "test-preview",
								urls: ["https://test-preview.test-worker.cloudflare.app"],
								worker_name: "test-worker",
								observability: { enabled: true },
								created_on: new Date().toISOString(),
							},
						});
					}
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments`,
					() => {
						return HttpResponse.json(
							{
								success: true,
								result: {
									id: "deployment-id-456",
									preview_id: "existing-preview-id",
									preview_name: "test-preview",
									urls: ["https://def67890.test-worker.cloudflare.app"],
									compatibility_date: "2025-01-01",
									env: {},
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						);
					}
				)
			);

			await runWrangler("preview --name test-preview");
			expect(std.out).toContain("Preview: test-preview");
			expect(std.out).toContain("(updated)");
			expect(std.out).toContain("Deployment:");
		});

		test("should use the URL-encoded preview name as the Preview identifier in path params", async ({
			expect,
		}) => {
			let lookupPreviewUrl: string | undefined;
			let createDeploymentUrl: string | undefined;

			msw.use(
				http.get(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId`,
					({ request }) => {
						lookupPreviewUrl = request.url;
						return HttpResponse.json(
							{
								success: false,
								result: null,
								errors: [{ code: 10025, message: "Preview not found" }],
							},
							{ status: 404 }
						);
					}
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews`,
					() =>
						HttpResponse.json(
							{
								success: true,
								result: {
									id: "preview-id-direct-name",
									name: "Feature Branch/One",
									slug: "feature-branch-one",
									urls: ["https://test-preview.test-worker.cloudflare.app"],
									worker_name: "test-worker",
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						)
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments`,
					({ request }) => {
						createDeploymentUrl = request.url;
						return HttpResponse.json(
							{
								success: true,
								result: {
									id: "deployment-id-direct-name",
									preview_id: "preview-id-direct-name",
									preview_name: "Feature Branch/One",
									urls: ["https://direct123.test-worker.cloudflare.app"],
									compatibility_date: "2025-01-01",
									env: {},
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						);
					}
				)
			);

			await runWrangler(
				'preview --name "Feature Branch/One" --worker-name test-worker'
			);

			expect(lookupPreviewUrl).toContain("/previews/Feature%20Branch%2FOne");
			expect(createDeploymentUrl).toContain(
				"/previews/preview-id-direct-name/deployments"
			);
		});

		test("should work without preview_defaults", async ({ expect }) => {
			msw.use(
				http.get(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId`,
					() =>
						HttpResponse.json(
							{
								success: false,
								result: null,
								errors: [{ code: 10025, message: "Preview not found" }],
							},
							{ status: 404 }
						)
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews`,
					() =>
						HttpResponse.json(
							{
								success: true,
								result: {
									id: "preview-id-789",
									name: "no-defaults-preview",
									slug: "no-defaults-preview",
									urls: [
										"https://no-defaults-preview.test-worker.cloudflare.app",
									],
									worker_name: "test-worker",
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						)
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments`,
					() =>
						HttpResponse.json(
							{
								success: true,
								result: {
									id: "deployment-id-789",
									preview_id: "preview-id-789",
									preview_name: "no-defaults-preview",
									urls: ["https://ghi12345.test-worker.cloudflare.app"],
									compatibility_date: "2025-01-01",
									env: {
										ENVIRONMENT: { type: "plain_text", text: "preview" },
										MY_KV: {
											type: "kv_namespace",
											namespace_id: "preview-kv-id",
										},
									},
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						)
				)
			);
			await runWrangler("preview --name no-defaults-preview");
			expect(std.out).toContain("Preview: no-defaults-preview (new)");
			expect(std.out).toContain("◆ from wrangler.json");
		});

		test("should show observability settings when configured", async ({
			expect,
		}) => {
			writeFileSync(
				"wrangler.json",
				JSON.stringify({
					name: "test-worker",
					main: "src/index.ts",
					compatibility_date: "2025-01-01",
					previews: {
						observability: { enabled: true, head_sampling_rate: 1.0 },
					},
				})
			);
			msw.use(
				http.get(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId`,
					() =>
						HttpResponse.json(
							{
								success: false,
								result: null,
								errors: [{ code: 10025, message: "Preview not found" }],
							},
							{ status: 404 }
						)
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews`,
					() =>
						HttpResponse.json(
							{
								success: true,
								result: {
									id: "preview-id-obs",
									name: "test-preview",
									slug: "test-preview",
									urls: ["https://test-preview.test-worker.cloudflare.app"],
									worker_name: "test-worker",
									observability: { enabled: true, head_sampling_rate: 1.0 },
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						)
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments`,
					() =>
						HttpResponse.json(
							{
								success: true,
								result: {
									id: "deployment-id-obs",
									preview_id: "preview-id-obs",
									preview_name: "test-preview",
									urls: ["https://obs12345.test-worker.cloudflare.app"],
									compatibility_date: "2025-01-01",
									env: {},
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						)
				)
			);
			await runWrangler("preview --name test-preview");
			expect(std.out).toContain("observability");
			expect(std.out).toContain("enabled");
		});

		test("should show compatibility_date when configured", async ({
			expect,
		}) => {
			msw.use(
				http.get(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId`,
					() =>
						HttpResponse.json(
							{
								success: false,
								result: null,
								errors: [{ code: 10025, message: "Preview not found" }],
							},
							{ status: 404 }
						)
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews`,
					() =>
						HttpResponse.json(
							{
								success: true,
								result: {
									id: "preview-id-compat",
									name: "test-preview",
									slug: "test-preview",
									urls: ["https://test-preview.test-worker.cloudflare.app"],
									worker_name: "test-worker",
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						)
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments`,
					() =>
						HttpResponse.json(
							{
								success: true,
								result: {
									id: "deployment-id-compat",
									preview_id: "preview-id-compat",
									preview_name: "test-preview",
									urls: ["https://compat12345.test-worker.cloudflare.app"],
									compatibility_date: "2025-01-01",
									env: {},
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						)
				)
			);
			await runWrangler("preview --name test-preview");
			expect(std.out).toContain("compatibility_date");
			expect(std.out).toContain("2025-01-01");
		});

		test("should pass ignore_defaults query param when --ignore-defaults flag is used", async ({
			expect,
		}) => {
			let createPreviewUrl: string | undefined;
			let createDeploymentUrl: string | undefined;
			msw.use(
				http.get(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId`,
					() =>
						HttpResponse.json(
							{
								success: false,
								result: null,
								errors: [{ code: 10025, message: "Preview not found" }],
							},
							{ status: 404 }
						)
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews`,
					({ request }) => {
						createPreviewUrl = request.url;
						return HttpResponse.json(
							{
								success: true,
								result: {
									id: "preview-id-ignore",
									name: "test-preview",
									slug: "test-preview",
									urls: ["https://test-preview.test-worker.cloudflare.app"],
									worker_name: "test-worker",
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						);
					}
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments`,
					({ request }) => {
						createDeploymentUrl = request.url;
						return HttpResponse.json(
							{
								success: true,
								result: {
									id: "deployment-id-ignore",
									preview_id: "preview-id-ignore",
									preview_name: "test-preview",
									urls: ["https://ignore12345.test-worker.cloudflare.app"],
									compatibility_date: "2025-01-01",
									env: {},
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						);
					}
				)
			);
			await runWrangler("preview --name test-preview --ignore-defaults");
			expect(createPreviewUrl).toContain("?ignore_defaults=true");
			expect(createDeploymentUrl).toContain("?ignore_defaults=true");
		});

		test("should include assets payload for deployment when assets are configured", async ({
			expect,
		}) => {
			mkdirSync("public", { recursive: true });
			writeFileSync("public/index.html", "<h1>Hello</h1>");
			writeFileSync("public/_headers", "/\n  Cache-Control: max-age=3600");
			writeFileSync("public/_redirects", "/old /new 301");
			writeFileSync(
				"wrangler.json",
				JSON.stringify({
					name: "test-worker",
					main: "src/index.ts",
					compatibility_date: "2025-01-01",
					assets: { directory: "public", run_worker_first: true },
				})
			);
			let deploymentRequestBody: Record<string, unknown> | undefined;
			let uploadSessionUrl: string | undefined;
			msw.use(
				http.get(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId`,
					() =>
						HttpResponse.json(
							{
								success: false,
								result: null,
								errors: [{ code: 10025, message: "Preview not found" }],
							},
							{ status: 404 }
						)
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews`,
					() =>
						HttpResponse.json(
							{
								success: true,
								result: {
									id: "preview-id-assets",
									name: "test-preview",
									slug: "test-preview",
									urls: ["https://test-preview.test-worker.cloudflare.app"],
									worker_name: "test-worker",
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						)
				),
				http.post(
					`*/accounts/:accountId/workers/scripts/:workerId/assets-upload-session`,
					async ({ request }) => {
						uploadSessionUrl = request.url;
						const body = (await request.json()) as { manifest?: unknown };
						expect(body.manifest).toBeDefined();
						return HttpResponse.json({
							success: true,
							result: { buckets: [], jwt: "assets-jwt-from-session" },
						});
					}
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments`,
					async ({ request }) => {
						deploymentRequestBody = (await request.json()) as Record<
							string,
							unknown
						>;
						return HttpResponse.json(
							{
								success: true,
								result: {
									id: "deployment-id-assets",
									preview_id: "preview-id-assets",
									preview_name: "test-preview",
									urls: ["https://assets123.test-worker.cloudflare.app"],
									compatibility_date: "2025-01-01",
									env: {},
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						);
					}
				)
			);
			await runWrangler("preview --name test-preview");
			expect(uploadSessionUrl).toContain(
				"/workers/scripts/test-worker/assets-upload-session"
			);
			expect(deploymentRequestBody?.assets).toMatchObject({
				jwt: "assets-jwt-from-session",
				config: { run_worker_first: true },
			});
			expect(deploymentRequestBody?.main_module).toBeDefined();
			expect(Array.isArray(deploymentRequestBody?.modules)).toBe(true);
		});

		test("should include source maps in deployment modules when upload_source_maps is enabled", async ({
			expect,
		}) => {
			writeFileSync(
				"wrangler.json",
				JSON.stringify({
					name: "test-worker",
					main: "src/index.ts",
					compatibility_date: "2025-01-01",
					upload_source_maps: true,
				})
			);

			let deploymentRequestBody:
				| (Record<string, unknown> & {
						modules?: Array<{
							name: string;
							content_type: string;
							content_base64: string;
						}>;
				  })
				| undefined;

			msw.use(
				http.get(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId`,
					() =>
						HttpResponse.json(
							{
								success: false,
								result: null,
								errors: [{ code: 10025, message: "Preview not found" }],
							},
							{ status: 404 }
						)
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews`,
					() =>
						HttpResponse.json(
							{
								success: true,
								result: {
									id: "preview-id-sourcemaps",
									name: "test-preview",
									slug: "test-preview",
									urls: ["https://test-preview.test-worker.cloudflare.app"],
									worker_name: "test-worker",
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						)
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments`,
					async ({ request }) => {
						deploymentRequestBody =
							(await request.json()) as typeof deploymentRequestBody;
						return HttpResponse.json(
							{
								success: true,
								result: {
									id: "deployment-id-sourcemaps",
									preview_id: "preview-id-sourcemaps",
									preview_name: "test-preview",
									urls: ["https://sourcemaps123.test-worker.cloudflare.app"],
									compatibility_date: "2025-01-01",
									env: {},
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						);
					}
				)
			);

			await runWrangler("preview --name test-preview");

			expect(deploymentRequestBody?.modules).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						name: expect.stringMatching(/\.map$/),
						content_type: "application/source-map",
					}),
				])
			);
		});

		test("should include migrations in the deployment request", async ({
			expect,
		}) => {
			writeFileSync(
				"wrangler.json",
				JSON.stringify({
					name: "test-worker",
					main: "src/index.ts",
					compatibility_date: "2025-01-01",
					migrations: [
						{ tag: "v1", new_classes: ["Counter"] },
						{
							tag: "v2",
							renamed_classes: [{ from: "Counter", to: "CounterV2" }],
						},
					],
				})
			);

			let deploymentRequestBody:
				| (Record<string, unknown> & {
						migrations?: {
							new_tag?: string;
							old_tag?: string;
							steps?: unknown[];
						};
				  })
				| undefined;
			let latestDeploymentUrl: string | undefined;

			msw.use(
				http.get(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId`,
					() =>
						HttpResponse.json(
							{
								success: false,
								result: null,
								errors: [{ code: 10025, message: "Preview not found" }],
							},
							{ status: 404 }
						)
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews`,
					() =>
						HttpResponse.json(
							{
								success: true,
								result: {
									id: "preview-id-migrations",
									name: "test-preview",
									slug: "test-preview",
									urls: ["https://test-preview.test-worker.cloudflare.app"],
									worker_name: "test-worker",
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						)
				),
				http.get(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments/latest`,
					({ request }) => {
						latestDeploymentUrl = request.url;
						return HttpResponse.json({
							success: true,
							result: {
								id: "deployment-id-current",
								preview_id: "preview-id-migrations",
								preview_name: "test-preview",
								migration_tag: "v1",
								urls: ["https://current.test-worker.cloudflare.app"],
								created_on: new Date().toISOString(),
							},
						});
					}
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments`,
					async ({ request }) => {
						deploymentRequestBody =
							(await request.json()) as typeof deploymentRequestBody;
						return HttpResponse.json(
							{
								success: true,
								result: {
									id: "deployment-id-migrations",
									preview_id: "preview-id-migrations",
									preview_name: "test-preview",
									urls: ["https://mig123.test-worker.cloudflare.app"],
									compatibility_date: "2025-01-01",
									env: {},
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						);
					}
				)
			);

			await runWrangler("preview --name test-preview");

			expect(latestDeploymentUrl).toContain(
				"/accounts/some-account-id/workers/workers/test-worker/previews/preview-id-migrations/deployments/latest"
			);
			expect(deploymentRequestBody?.migrations).toMatchObject({
				old_tag: "v1",
				new_tag: "v2",
				steps: [{ renamed_classes: [{ from: "Counter", to: "CounterV2" }] }],
			});
		});

		test("should handle first preview deployment when latest deployment is missing", async ({
			expect,
		}) => {
			writeFileSync(
				"wrangler.json",
				JSON.stringify({
					name: "test-worker",
					main: "src/index.ts",
					compatibility_date: "2025-01-01",
					migrations: [{ tag: "v1", new_classes: ["Counter"] }],
				})
			);

			let deploymentRequestBody:
				| (Record<string, unknown> & {
						migrations?: {
							new_tag?: string;
							old_tag?: string;
							steps?: unknown[];
						};
				  })
				| undefined;

			msw.use(
				http.get(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId`,
					() =>
						HttpResponse.json(
							{
								success: false,
								result: null,
								errors: [{ code: 10025, message: "Preview not found" }],
							},
							{ status: 404 }
						)
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews`,
					() =>
						HttpResponse.json(
							{
								success: true,
								result: {
									id: "preview-id-first-migration",
									name: "test-preview",
									slug: "test-preview",
									urls: ["https://test-preview.test-worker.cloudflare.app"],
									worker_name: "test-worker",
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						)
				),
				http.get(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments/latest`,
					() =>
						HttpResponse.json(
							{
								success: false,
								result: null,
								errors: [
									{
										code: 10222,
										message:
											"This Worker has no versions, which means this Worker has no content or versioned settings.",
									},
								],
							},
							{ status: 404 }
						)
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments`,
					async ({ request }) => {
						deploymentRequestBody =
							(await request.json()) as typeof deploymentRequestBody;
						return HttpResponse.json(
							{
								success: true,
								result: {
									id: "deployment-id-first-migration",
									preview_id: "preview-id-first-migration",
									preview_name: "test-preview",
									urls: ["https://first123.test-worker.cloudflare.app"],
									compatibility_date: "2025-01-01",
									env: {},
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						);
					}
				)
			);

			await runWrangler("preview --name test-preview");

			expect(deploymentRequestBody?.migrations).toMatchObject({
				new_tag: "v1",
				steps: [{ new_classes: ["Counter"] }],
			});
			expect(deploymentRequestBody?.migrations?.old_tag).toBeUndefined();
		});

		test("should include deployment annotations from message and tag args", async ({
			expect,
		}) => {
			let deploymentRequestBody:
				| (Record<string, unknown> & {
						annotations?: {
							"workers/message"?: string;
							"workers/tag"?: string;
						};
				  })
				| undefined;

			msw.use(
				http.get(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId`,
					() =>
						HttpResponse.json(
							{
								success: false,
								result: null,
								errors: [{ code: 10025, message: "Preview not found" }],
							},
							{ status: 404 }
						)
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews`,
					() =>
						HttpResponse.json(
							{
								success: true,
								result: {
									id: "preview-id-annotations",
									name: "test-preview",
									slug: "test-preview",
									urls: ["https://test-preview.test-worker.cloudflare.app"],
									worker_name: "test-worker",
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						)
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments`,
					async ({ request }) => {
						deploymentRequestBody =
							(await request.json()) as typeof deploymentRequestBody;
						return HttpResponse.json(
							{
								success: true,
								result: {
									id: "deployment-id-annotations",
									preview_id: "preview-id-annotations",
									preview_name: "test-preview",
									urls: ["https://annotations123.test-worker.cloudflare.app"],
									compatibility_date: "2025-01-01",
									env: {},
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						);
					}
				)
			);

			await runWrangler(
				'preview --name test-preview --tag v1.2.3 --message "preview note"'
			);

			expect(deploymentRequestBody?.annotations).toEqual({
				"workers/message": "preview note",
				"workers/tag": "v1.2.3",
			});
		});

		test("should inherit top-level previews config into an environment when env.previews is absent", async ({
			expect,
		}) => {
			writeFileSync(
				"wrangler.json",
				JSON.stringify({
					name: "test-worker",
					main: "src/index.ts",
					compatibility_date: "2025-01-01",
					placement: { mode: "smart" },
					previews: {
						observability: { enabled: true },
						vars: { TOP_LEVEL_PREVIEW: "top-value" },
						kv_namespaces: [{ binding: "TOP_KV", id: "top-kv-id" }],
					},
					env: {
						staging: {},
					},
				})
			);

			let createPreviewRequestBody:
				| {
						observability?: { enabled?: boolean };
				  }
				| undefined;
			let deploymentRequestBody:
				| {
						compatibility_date?: string;
						placement?: { mode?: string };
						env?: Record<
							string,
							{ type: string; text?: string; namespace_id?: string }
						>;
				  }
				| undefined;

			msw.use(
				http.get(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId`,
					() =>
						HttpResponse.json(
							{
								success: false,
								result: null,
								errors: [{ code: 10025, message: "Preview not found" }],
							},
							{ status: 404 }
						)
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews`,
					async ({ request }) => {
						createPreviewRequestBody =
							(await request.json()) as typeof createPreviewRequestBody;
						return HttpResponse.json(
							{
								success: true,
								result: {
									id: "preview-id-env-inherit",
									name: "test-preview",
									slug: "test-preview",
									urls: ["https://test-preview.test-worker.cloudflare.app"],
									worker_name: "test-worker",
									observability: { enabled: true },
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						);
					}
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments`,
					async ({ request }) => {
						deploymentRequestBody =
							(await request.json()) as typeof deploymentRequestBody;
						return HttpResponse.json(
							{
								success: true,
								result: {
									id: "deployment-id-env-inherit",
									preview_id: "preview-id-env-inherit",
									preview_name: "test-preview",
									urls: ["https://env-inherit.test-worker.cloudflare.app"],
									compatibility_date: "2025-01-01",
									env: deploymentRequestBody?.env ?? {},
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						);
					}
				)
			);

			await runWrangler("preview --env staging --name test-preview");

			expect(createPreviewRequestBody?.observability).toEqual({
				enabled: true,
			});
			expect(deploymentRequestBody?.compatibility_date).toBe("2025-01-01");
			expect(deploymentRequestBody?.placement).toEqual({ mode: "smart" });
			expect(deploymentRequestBody?.env).toMatchObject({
				TOP_LEVEL_PREVIEW: { type: "plain_text", text: "top-value" },
				TOP_KV: { type: "kv_namespace", namespace_id: "top-kv-id" },
			});
		});

		test("should use env-specific previews config instead of top-level previews config", async ({
			expect,
		}) => {
			writeFileSync(
				"wrangler.json",
				JSON.stringify({
					name: "test-worker",
					main: "src/index.ts",
					compatibility_date: "2025-01-01",
					limits: { cpu_ms: 100 },
					previews: {
						observability: { enabled: true },
						vars: { TOP_LEVEL_PREVIEW: "top-value" },
						kv_namespaces: [{ binding: "TOP_KV", id: "top-kv-id" }],
						limits: { cpu_ms: 25 },
					},
					env: {
						staging: {
							previews: {
								observability: { enabled: false },
								vars: { STAGE_PREVIEW: "stage-value" },
								queues: {
									producers: [{ binding: "STAGE_QUEUE", queue: "jobs" }],
								},
								limits: { cpu_ms: 50 },
							},
						},
					},
				})
			);

			let createPreviewRequestBody:
				| {
						observability?: { enabled?: boolean };
				  }
				| undefined;
			let deploymentRequestBody:
				| {
						compatibility_date?: string;
						limits?: { cpu_ms?: number };
						env?: Record<
							string,
							{
								type: string;
								text?: string;
								queue_name?: string;
								namespace_id?: string;
							}
						>;
				  }
				| undefined;

			msw.use(
				http.get(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId`,
					() =>
						HttpResponse.json(
							{
								success: false,
								result: null,
								errors: [{ code: 10025, message: "Preview not found" }],
							},
							{ status: 404 }
						)
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews`,
					async ({ request }) => {
						createPreviewRequestBody =
							(await request.json()) as typeof createPreviewRequestBody;
						return HttpResponse.json(
							{
								success: true,
								result: {
									id: "preview-id-env-override",
									name: "test-preview",
									slug: "test-preview",
									urls: ["https://test-preview.test-worker.cloudflare.app"],
									worker_name: "test-worker",
									observability: { enabled: false },
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						);
					}
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments`,
					async ({ request }) => {
						deploymentRequestBody =
							(await request.json()) as typeof deploymentRequestBody;
						return HttpResponse.json(
							{
								success: true,
								result: {
									id: "deployment-id-env-override",
									preview_id: "preview-id-env-override",
									preview_name: "test-preview",
									urls: ["https://env-override.test-worker.cloudflare.app"],
									compatibility_date: "2025-01-01",
									env: deploymentRequestBody?.env ?? {},
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						);
					}
				)
			);

			await runWrangler("preview --env staging --name test-preview");

			expect(createPreviewRequestBody?.observability).toEqual({
				enabled: false,
			});
			expect(deploymentRequestBody?.compatibility_date).toBe("2025-01-01");
			expect(deploymentRequestBody?.limits).toEqual({ cpu_ms: 50 });
			expect(deploymentRequestBody?.env).toMatchObject({
				STAGE_PREVIEW: { type: "plain_text", text: "stage-value" },
				STAGE_QUEUE: { type: "queue", queue_name: "jobs" },
			});
			expect(deploymentRequestBody?.env).not.toHaveProperty(
				"TOP_LEVEL_PREVIEW"
			);
			expect(deploymentRequestBody?.env).not.toHaveProperty("TOP_KV");
		});

		test("should respect env-specific worker name for preview and deployment requests", async ({
			expect,
		}) => {
			writeFileSync(
				"wrangler.json",
				JSON.stringify({
					name: "top-worker",
					main: "src/index.ts",
					compatibility_date: "2025-01-01",
					env: {
						staging: {
							name: "staging-worker",
						},
					},
				})
			);

			let getPreviewUrl: string | undefined;
			let createDeploymentUrl: string | undefined;

			msw.use(
				http.get(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId`,
					({ request }) => {
						getPreviewUrl = request.url;
						return HttpResponse.json(
							{
								success: false,
								result: null,
								errors: [{ code: 10025, message: "Preview not found" }],
							},
							{ status: 404 }
						);
					}
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews`,
					() =>
						HttpResponse.json(
							{
								success: true,
								result: {
									id: "preview-id-env-worker",
									name: "test-preview",
									slug: "test-preview",
									urls: ["https://test-preview.test-worker.cloudflare.app"],
									worker_name: "staging-worker",
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						)
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments`,
					({ request }) => {
						createDeploymentUrl = request.url;
						return HttpResponse.json(
							{
								success: true,
								result: {
									id: "deployment-id-env-worker",
									preview_id: "preview-id-env-worker",
									preview_name: "test-preview",
									urls: ["https://env-worker.test-worker.cloudflare.app"],
									compatibility_date: "2025-01-01",
									env: {},
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						);
					}
				)
			);

			await runWrangler("preview --env staging --name test-preview");

			expect(getPreviewUrl).toContain(
				"/workers/workers/staging-worker/previews/"
			);
			expect(createDeploymentUrl).toContain(
				"/workers/workers/staging-worker/previews/preview-id-env-worker/deployments"
			);
		});

		test("should fail before making API calls when env-specific previews config is invalid", async ({
			expect,
		}) => {
			writeFileSync(
				"wrangler.json",
				JSON.stringify({
					name: "test-worker",
					main: "src/index.ts",
					compatibility_date: "2025-01-01",
					env: {
						staging: {
							previews: {
								browser: "not-an-object",
							},
						},
					},
				})
			);

			let requested = false;
			msw.use(
				http.get(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId`,
					() => {
						requested = true;
						return HttpResponse.json({ success: true, result: {} });
					}
				)
			);

			await expect(
				runWrangler("preview --env staging --name test-preview")
			).rejects.toThrow(/previews\.browser/);
			expect(requested).toBe(false);
		});
	});

	describe("preview delete", () => {
		beforeEach(() => {
			writeFileSync(
				"wrangler.json",
				JSON.stringify({
					name: "test-worker",
					main: "src/index.ts",
					compatibility_date: "2025-01-01",
				})
			);
			msw.resetHandlers();
		});

		test("should delete a preview with --skip-confirmation", async ({
			expect,
		}) => {
			let deleteUrl: string | undefined;
			msw.use(
				http.delete(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId`,
					({ request }) => {
						deleteUrl = request.url;
						return HttpResponse.json({ success: true, result: null });
					}
				)
			);
			await runWrangler(
				"preview delete --name my-feature --skip-confirmation --worker-name test-worker"
			);
			expect(deleteUrl).toContain("/previews/my-feature");
			expect(std.out).toContain('Preview "my-feature" deleted successfully');
		});

		test("should proceed with deletion in non-interactive mode (CI fallback)", async ({
			expect,
		}) => {
			// In non-interactive/CI mode, confirm() returns the fallback value (true),
			// so deletion proceeds without prompting.
			let deleteCalled = false;
			msw.use(
				http.delete(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId`,
					() => {
						deleteCalled = true;
						return HttpResponse.json({ success: true, result: null });
					}
				)
			);
			await runWrangler(
				"preview delete --name my-feature --worker-name test-worker"
			);
			expect(deleteCalled).toBe(true);
			expect(std.out).toContain('Preview "my-feature" deleted successfully');
		});

		test("should use --worker-name to target the correct worker", async ({
			expect,
		}) => {
			let deleteUrl: string | undefined;
			msw.use(
				http.delete(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId`,
					({ request }) => {
						deleteUrl = request.url;
						return HttpResponse.json({ success: true, result: null });
					}
				)
			);
			await runWrangler(
				"preview delete --name test-branch -y --worker-name custom-worker"
			);
			expect(deleteUrl).toContain("/workers/workers/custom-worker/previews/");
		});

		test("should URL-encode the preview name when deleting", async ({
			expect,
		}) => {
			let deleteUrl: string | undefined;
			msw.use(
				http.delete(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId`,
					({ request }) => {
						deleteUrl = request.url;
						return HttpResponse.json({ success: true, result: null });
					}
				)
			);
			await runWrangler(
				'preview delete --name "Feature Branch/One" -y --worker-name test-worker'
			);
			expect(deleteUrl).toContain("/previews/Feature%20Branch%2FOne");
		});

		test("should respect env-specific worker name when deleting", async ({
			expect,
		}) => {
			writeFileSync(
				"wrangler.json",
				JSON.stringify({
					name: "top-worker",
					main: "src/index.ts",
					compatibility_date: "2025-01-01",
					env: { staging: { name: "staging-worker" } },
				})
			);
			let deleteUrl: string | undefined;
			msw.use(
				http.delete(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId`,
					({ request }) => {
						deleteUrl = request.url;
						return HttpResponse.json({ success: true, result: null });
					}
				)
			);
			await runWrangler("preview delete --env staging --name test-preview -y");
			expect(deleteUrl).toContain("/workers/workers/staging-worker/previews/");
		});
	});

	describe("preview settings", () => {
		beforeEach(() => {
			mkdirSync("src", { recursive: true });
			writeFileSync(
				"src/index.ts",
				"export default { fetch() { return new Response('ok'); } };"
			);
			writeFileSync(
				"wrangler.json",
				JSON.stringify({
					name: "test-worker",
					main: "src/index.ts",
					compatibility_date: "2025-01-01",
					previews: {
						vars: { ENVIRONMENT: "preview" },
						kv_namespaces: [{ binding: "MY_KV", id: "preview-kv-id" }],
					},
				})
			);
			msw.resetHandlers();
		});

		test("should list current preview settings as JSON", async ({ expect }) => {
			msw.use(
				http.get(`*/accounts/:accountId/workers/workers/:workerId`, () =>
					HttpResponse.json({
						success: true,
						result: {
							preview_defaults: {
								compatibility_date: "2025-01-01",
								logpush: false,
								env: {
									ENVIRONMENT: { type: "plain_text", text: "preview" },
								},
							},
						},
					})
				)
			);
			await runWrangler(
				"preview settings --worker-name override-worker --json"
			);
			expect(std.out).toContain('"compatibility_date": "2025-01-01"');
			expect(std.out).toContain('"ENVIRONMENT"');
		});

		test("should list current Previews settings in pretty format", async ({
			expect,
		}) => {
			msw.use(
				http.get(`*/accounts/:accountId/workers/workers/:workerId`, () =>
					HttpResponse.json({
						success: true,
						result: {
							preview_defaults: {
								compatibility_date: "2025-01-01",
								compatibility_flags: ["nodejs_compat"],
								observability: { enabled: true, head_sampling_rate: 0.5 },
								logpush: false,
								limits: { cpu_ms: 50 },
								placement: { mode: "smart" },
								env: {
									ENVIRONMENT: { type: "plain_text", text: "preview" },
									API_KEY: { type: "secret_text" },
								},
							},
						},
					})
				)
			);
			await runWrangler("preview settings --worker-name override-worker");
			expect(std.out).toContain("Worker: override-worker");
			expect(std.out).toContain("Previews settings");
			expect(std.out).toContain("2025-01-01");
			expect(std.out).toContain("nodejs_compat");
			expect(std.out).toContain("enabled, 0.5 sampling");
			expect(std.out).toContain("disabled");
			expect(std.out).toContain("cpu_ms 50");
			expect(std.out).toContain("smart");
			expect(std.out).toContain("********");
			expect(std.out).toContain("╭");
		});

		test("should show empty bindings in pretty format", async ({ expect }) => {
			msw.use(
				http.get(`*/accounts/:accountId/workers/workers/:workerId`, () =>
					HttpResponse.json({
						success: true,
						result: {
							preview_defaults: {
								compatibility_date: "2025-01-01",
								env: {},
							},
						},
					})
				)
			);
			await runWrangler("preview settings --worker-name override-worker");
			expect(std.out).toContain("Bindings");
			expect(std.out).toContain("(none)");
		});

		test("should respect env-specific worker name when listing settings", async ({
			expect,
		}) => {
			writeFileSync(
				"wrangler.json",
				JSON.stringify({
					name: "top-worker",
					main: "src/index.ts",
					compatibility_date: "2025-01-01",
					env: { staging: { name: "staging-worker" } },
				})
			);
			let getUrl: string | undefined;
			msw.use(
				http.get(
					`*/accounts/:accountId/workers/workers/:workerId`,
					({ request }) => {
						getUrl = request.url;
						return HttpResponse.json({
							success: true,
							result: { preview_defaults: {} },
						});
					}
				)
			);
			await runWrangler("preview settings --env staging");
			expect(getUrl).toContain("/workers/workers/staging-worker");
			expect(std.out).toContain("Worker: staging-worker");
		});
	});

	describe("preview settings update", () => {
		beforeEach(() => {
			mkdirSync("src", { recursive: true });
			writeFileSync(
				"src/index.ts",
				"export default { fetch() { return new Response('ok'); } };"
			);
			writeFileSync(
				"wrangler.json",
				JSON.stringify({
					name: "test-worker",
					main: "src/index.ts",
					compatibility_date: "2025-01-01",
					previews: {
						vars: { ENVIRONMENT: "preview" },
						kv_namespaces: [{ binding: "MY_KV", id: "preview-kv-id" }],
					},
				})
			);
			msw.resetHandlers();
		});

		test("should update preview settings from wrangler config", async ({
			expect,
		}) => {
			let patchCalled = false;
			let patchRequestBody:
				| {
						preview_defaults?: {
							env?: Record<
								string,
								{ type: string; text?: string; namespace_id?: string }
							>;
							compatibility_date?: string;
							logpush?: boolean;
							observability?: {
								enabled?: boolean;
								head_sampling_rate?: number;
							};
						};
				  }
				| undefined;
			msw.use(
				http.get(`*/accounts/:accountId/workers/workers/:workerId`, () =>
					HttpResponse.json({
						success: true,
						result: {
							preview_defaults: {
								observability: { enabled: true, head_sampling_rate: 1 },
								logpush: false,
								env: { OLD: { type: "plain_text", text: "value" } },
							},
						},
					})
				),
				http.patch(
					`*/accounts/:accountId/workers/workers/:workerId`,
					async ({ request }) => {
						patchCalled = true;
						patchRequestBody =
							(await request.json()) as typeof patchRequestBody;
						return HttpResponse.json({ success: true, result: {} });
					}
				)
			);
			await runWrangler(
				"preview settings update --worker-name override-worker --skip-confirmation"
			);
			expect(patchCalled).toBe(true);
			expect(patchRequestBody?.preview_defaults?.compatibility_date).toBe(
				"2025-01-01"
			);
			expect(std.out).toContain(
				"✨ Updated Previews settings for Worker override-worker."
			);
			expect(std.out).toContain("Worker: override-worker");
			expect(patchRequestBody?.preview_defaults?.env).toMatchObject({
				OLD: { type: "plain_text", text: "value" },
				ENVIRONMENT: { type: "plain_text", text: "preview" },
				MY_KV: { type: "kv_namespace", namespace_id: "preview-kv-id" },
			});
		});

		test("should preserve nested observability fields when only partially overridden", async ({
			expect,
		}) => {
			writeFileSync(
				"wrangler.json",
				JSON.stringify({
					name: "test-worker",
					main: "src/index.ts",
					compatibility_date: "2025-01-01",
					previews: { observability: { enabled: true } },
				})
			);
			let patchRequestBody:
				| {
						preview_defaults?: {
							observability?: {
								enabled?: boolean;
								head_sampling_rate?: number;
							};
						};
				  }
				| undefined;
			msw.use(
				http.get(`*/accounts/:accountId/workers/workers/:workerId`, () =>
					HttpResponse.json({
						success: true,
						result: {
							preview_defaults: {
								observability: { enabled: false, head_sampling_rate: 0.25 },
							},
						},
					})
				),
				http.patch(
					`*/accounts/:accountId/workers/workers/:workerId`,
					async ({ request }) => {
						patchRequestBody =
							(await request.json()) as typeof patchRequestBody;
						return HttpResponse.json({ success: true, result: {} });
					}
				)
			);
			await runWrangler(
				"preview settings update --worker-name override-worker --skip-confirmation"
			);
			expect(patchRequestBody?.preview_defaults?.observability).toEqual({
				enabled: true,
				head_sampling_rate: 0.25,
			});
		});

		test("should render canonical Previews settings returned by the update response", async ({
			expect,
		}) => {
			msw.use(
				http.get(`*/accounts/:accountId/workers/workers/:workerId`, () =>
					HttpResponse.json({
						success: true,
						result: {
							preview_defaults: { compatibility_date: "2024-12-31" },
						},
					})
				),
				http.patch(
					`*/accounts/:accountId/workers/workers/:workerId`,
					async () =>
						HttpResponse.json({
							success: true,
							result: {
								preview_defaults: { compatibility_date: "2025-02-02" },
							},
						})
				)
			);
			await runWrangler(
				"preview settings update --worker-name override-worker --skip-confirmation"
			);
			expect(std.out).toContain("2025-02-02");
		});

		test("should prefer previews limits over top-level limits", async ({
			expect,
		}) => {
			writeFileSync(
				"wrangler.json",
				JSON.stringify({
					name: "test-worker",
					main: "src/index.ts",
					compatibility_date: "2025-01-01",
					limits: { cpu_ms: 100 },
					previews: { limits: { cpu_ms: 50 } },
				})
			);
			let patchRequestBody:
				| { preview_defaults?: { limits?: { cpu_ms?: number } } }
				| undefined;
			msw.use(
				http.get(`*/accounts/:accountId/workers/workers/:workerId`, () =>
					HttpResponse.json({
						success: true,
						result: { preview_defaults: {} },
					})
				),
				http.patch(
					`*/accounts/:accountId/workers/workers/:workerId`,
					async ({ request }) => {
						patchRequestBody =
							(await request.json()) as typeof patchRequestBody;
						return HttpResponse.json({ success: true, result: {} });
					}
				)
			);
			await runWrangler(
				"preview settings update --worker-name override-worker --skip-confirmation"
			);
			expect(patchRequestBody?.preview_defaults?.limits).toEqual({
				cpu_ms: 50,
			});
		});

		test("should skip updating when Previews settings are already up to date", async ({
			expect,
		}) => {
			let patchCalled = false;
			msw.use(
				http.get(`*/accounts/:accountId/workers/workers/:workerId`, () =>
					HttpResponse.json({
						success: true,
						result: {
							preview_defaults: {
								compatibility_date: "2025-01-01",
								env: {
									ENVIRONMENT: { type: "plain_text", text: "preview" },
									MY_KV: {
										type: "kv_namespace",
										namespace_id: "preview-kv-id",
									},
								},
							},
						},
					})
				),
				http.patch(`*/accounts/:accountId/workers/workers/:workerId`, () => {
					patchCalled = true;
					return HttpResponse.json({ success: true, result: {} });
				})
			);
			await runWrangler(
				"preview settings update --worker-name override-worker"
			);
			expect(patchCalled).toBe(false);
			expect(std.out).toContain(
				"✨ Previews settings for Worker override-worker are already up to date."
			);
		});

		test("should not clear existing bindings when previews has only non-binding settings", async ({
			expect,
		}) => {
			writeFileSync(
				"wrangler.json",
				JSON.stringify({
					name: "test-worker",
					main: "src/index.ts",
					compatibility_date: "2025-01-01",
					previews: { logpush: false },
				})
			);
			let patchRequestBody:
				| {
						preview_defaults?: {
							env?: Record<string, { type: string; text?: string }>;
							logpush?: boolean;
						};
				  }
				| undefined;
			msw.use(
				http.get(`*/accounts/:accountId/workers/workers/:workerId`, () =>
					HttpResponse.json({
						success: true,
						result: {
							preview_defaults: {
								compatibility_date: "2025-01-01",
								logpush: true,
								env: {
									EXISTING_SECRET: { type: "plain_text", text: "value" },
								},
							},
						},
					})
				),
				http.patch(
					`*/accounts/:accountId/workers/workers/:workerId`,
					async ({ request }) => {
						patchRequestBody =
							(await request.json()) as typeof patchRequestBody;
						return HttpResponse.json({ success: true, result: {} });
					}
				)
			);
			await runWrangler(
				"preview settings update --worker-name override-worker"
			);
			expect(patchRequestBody?.preview_defaults?.logpush).toBe(false);
			expect(patchRequestBody?.preview_defaults?.env).toMatchObject({
				EXISTING_SECRET: { type: "plain_text", text: "value" },
			});
		});

		test("should replace binding entries wholesale when type changes", async ({
			expect,
		}) => {
			writeFileSync(
				"wrangler.json",
				JSON.stringify({
					name: "test-worker",
					main: "src/index.ts",
					compatibility_date: "2025-01-01",
					previews: { vars: { MY_BINDING: "new-value" } },
				})
			);
			let patchRequestBody:
				| {
						preview_defaults?: {
							env?: Record<string, Record<string, unknown>>;
						};
				  }
				| undefined;
			msw.use(
				http.get(`*/accounts/:accountId/workers/workers/:workerId`, () =>
					HttpResponse.json({
						success: true,
						result: {
							preview_defaults: {
								compatibility_date: "2025-01-01",
								env: {
									MY_BINDING: {
										type: "kv_namespace",
										namespace_id: "old-kv-id",
									},
								},
							},
						},
					})
				),
				http.patch(
					`*/accounts/:accountId/workers/workers/:workerId`,
					async ({ request }) => {
						patchRequestBody =
							(await request.json()) as typeof patchRequestBody;
						return HttpResponse.json({ success: true, result: {} });
					}
				)
			);
			await runWrangler(
				"preview settings update --worker-name override-worker --skip-confirmation"
			);
			const binding = patchRequestBody?.preview_defaults?.env?.MY_BINDING;
			expect(binding?.type).toBe("plain_text");
			expect(binding?.text).toBe("new-value");
			expect(binding?.namespace_id).toBeUndefined();
		});

		test("should resolve env-specific previews settings using config inheritability rules", async ({
			expect,
		}) => {
			writeFileSync(
				"wrangler.json",
				JSON.stringify({
					name: "test-worker",
					main: "src/index.ts",
					compatibility_date: "2025-01-01",
					placement: { mode: "smart" },
					limits: { cpu_ms: 100 },
					previews: {
						vars: { TOP_ONLY: "top" },
						limits: { cpu_ms: 25 },
					},
					env: {
						staging: {
							previews: {
								vars: { STAGE_ONLY: "stage" },
								limits: { cpu_ms: 50 },
							},
						},
					},
				})
			);

			let patchRequestBody:
				| {
						preview_defaults?: {
							compatibility_date?: string;
							placement?: { mode?: string };
							limits?: { cpu_ms?: number };
							env?: Record<string, { type: string; text?: string }>;
						};
				  }
				| undefined;

			msw.use(
				http.get(`*/accounts/:accountId/workers/workers/:workerId`, () =>
					HttpResponse.json({
						success: true,
						result: { preview_defaults: {} },
					})
				),
				http.patch(
					`*/accounts/:accountId/workers/workers/:workerId`,
					async ({ request }) => {
						patchRequestBody =
							(await request.json()) as typeof patchRequestBody;
						return HttpResponse.json({ success: true, result: {} });
					}
				)
			);

			await runWrangler(
				"preview settings update --env staging --worker-name override-worker --skip-confirmation"
			);

			expect(patchRequestBody?.preview_defaults?.compatibility_date).toBe(
				"2025-01-01"
			);
			expect(patchRequestBody?.preview_defaults?.placement).toEqual({
				mode: "smart",
			});
			expect(patchRequestBody?.preview_defaults?.limits).toEqual({
				cpu_ms: 50,
			});
			expect(patchRequestBody?.preview_defaults?.env).toMatchObject({
				STAGE_ONLY: { type: "plain_text", text: "stage" },
			});
			expect(patchRequestBody?.preview_defaults?.env).not.toHaveProperty(
				"TOP_ONLY"
			);
		});

		test("should fail before making API calls when env-specific previews.queues is malformed", async ({
			expect,
		}) => {
			writeFileSync(
				"wrangler.json",
				JSON.stringify({
					name: "test-worker",
					main: "src/index.ts",
					compatibility_date: "2025-01-01",
					env: {
						staging: {
							previews: {
								queues: [{ binding: "MY_QUEUE", queue: "jobs" }],
							},
						},
					},
				})
			);

			let requested = false;
			msw.use(
				http.get(`*/accounts/:accountId/workers/workers/:workerId`, () => {
					requested = true;
					return HttpResponse.json({
						success: true,
						result: { preview_defaults: {} },
					});
				})
			);

			await expect(
				runWrangler(
					"preview settings update --env staging --worker-name override-worker --skip-confirmation"
				)
			).rejects.toThrow(/previews\.queues/);
			expect(requested).toBe(false);
		});
	});

	describe("preview secret", () => {
		beforeEach(() => {
			mkdirSync("src", { recursive: true });
			writeFileSync(
				"src/index.ts",
				"export default { fetch() { return new Response('ok'); } };"
			);
			writeFileSync(
				"wrangler.json",
				JSON.stringify({
					name: "test-worker",
					main: "src/index.ts",
					compatibility_date: "2025-01-01",
				})
			);
			msw.resetHandlers();
		});

		describe("put", () => {
			const mockStdIn = useMockStdin({ isTTY: false });

			test("should add a secret to Previews settings", async ({ expect }) => {
				mockStdIn.send("defaults-secret");
				let patchRequestBody:
					| {
							preview_defaults?: {
								env?: Record<string, { type: string; text?: string }>;
							};
					  }
					| undefined;
				msw.use(
					http.get(`*/accounts/:accountId/workers/workers/:workerId`, () =>
						HttpResponse.json({
							success: true,
							result: {
								preview_defaults: {
									env: { OLD_SECRET: { type: "secret_text" } },
								},
							},
						})
					),
					http.patch(
						`*/accounts/:accountId/workers/workers/:workerId`,
						async ({ request }) => {
							patchRequestBody =
								(await request.json()) as typeof patchRequestBody;
							return HttpResponse.json({ success: true, result: {} });
						}
					)
				);
				await runWrangler(
					"preview secret put API_KEY --worker-name test-worker"
				);
				expect(patchRequestBody?.preview_defaults?.env?.API_KEY).toMatchObject({
					type: "secret_text",
					text: "defaults-secret",
				});
				expect(
					patchRequestBody?.preview_defaults?.env?.OLD_SECRET
				).toMatchObject({ type: "secret_text" });
				expect(std.out).toContain(
					'Secret "API_KEY" added to Previews settings for "test-worker"'
				);
			});

			test("should respect env-specific worker name when using --env", async ({
				expect,
			}) => {
				mockStdIn.send("env-secret");
				writeFileSync(
					"wrangler.json",
					JSON.stringify({
						name: "top-worker",
						main: "src/index.ts",
						compatibility_date: "2025-01-01",
						env: {
							staging: {
								name: "staging-worker",
							},
						},
					})
				);

				let getUrl: string | undefined;
				let patchUrl: string | undefined;

				msw.use(
					http.get(
						`*/accounts/:accountId/workers/workers/:workerId`,
						({ request }) => {
							getUrl = request.url;
							return HttpResponse.json({
								success: true,
								result: { preview_defaults: {} },
							});
						}
					),
					http.patch(
						`*/accounts/:accountId/workers/workers/:workerId`,
						({ request }) => {
							patchUrl = request.url;
							return HttpResponse.json({ success: true, result: {} });
						}
					)
				);

				await runWrangler("preview secret put API_KEY --env staging");

				expect(getUrl).toContain("/workers/workers/staging-worker");
				expect(patchUrl).toContain("/workers/workers/staging-worker");
				expect(std.out).toContain(
					'Secret "API_KEY" added to Previews settings for "staging-worker"'
				);
			});

			test("should fail before making API calls when env-specific previews config is invalid", async ({
				expect,
			}) => {
				writeFileSync(
					"wrangler.json",
					JSON.stringify({
						name: "test-worker",
						main: "src/index.ts",
						compatibility_date: "2025-01-01",
						env: {
							staging: {
								previews: {
									browser: "not-an-object",
								},
							},
						},
					})
				);

				let requested = false;
				msw.use(
					http.get(`*/accounts/:accountId/workers/workers/:workerId`, () => {
						requested = true;
						return HttpResponse.json({
							success: true,
							result: { preview_defaults: {} },
						});
					}),
					http.patch(`*/accounts/:accountId/workers/workers/:workerId`, () => {
						requested = true;
						return HttpResponse.json({ success: true, result: {} });
					})
				);

				await expect(
					runWrangler("preview secret put API_KEY --env staging")
				).rejects.toThrow(/previews\.browser/);
				expect(requested).toBe(false);
			});
		});

		describe("delete", () => {
			test("should delete a secret from Previews settings", async ({
				expect,
			}) => {
				let patchRequestBody:
					| {
							preview_defaults?: {
								env?: Record<string, { type: string; text?: string }>;
							};
					  }
					| undefined;
				msw.use(
					http.get(`*/accounts/:accountId/workers/workers/:workerId`, () =>
						HttpResponse.json({
							success: true,
							result: {
								preview_defaults: {
									env: {
										KEEP_ME: { type: "secret_text" },
										REMOVE_ME: { type: "secret_text" },
										VAR: { type: "plain_text", text: "value" },
									},
								},
							},
						})
					),
					http.patch(
						`*/accounts/:accountId/workers/workers/:workerId`,
						async ({ request }) => {
							patchRequestBody =
								(await request.json()) as typeof patchRequestBody;
							return HttpResponse.json({ success: true, result: {} });
						}
					)
				);
				await runWrangler(
					"preview secret delete REMOVE_ME --skip-confirmation --worker-name test-worker"
				);
				const env = patchRequestBody?.preview_defaults?.env ?? {};
				expect(env).toHaveProperty("KEEP_ME");
				expect(env).toHaveProperty("VAR");
				expect(env).not.toHaveProperty("REMOVE_ME");
				expect(std.out).toContain(
					'Secret "REMOVE_ME" deleted from Previews settings'
				);
			});

			test("should respect env-specific worker name when deleting a secret", async ({
				expect,
			}) => {
				writeFileSync(
					"wrangler.json",
					JSON.stringify({
						name: "top-worker",
						main: "src/index.ts",
						compatibility_date: "2025-01-01",
						env: { staging: { name: "staging-worker" } },
					})
				);
				let getUrl: string | undefined;
				let patchUrl: string | undefined;
				msw.use(
					http.get(
						`*/accounts/:accountId/workers/workers/:workerId`,
						({ request }) => {
							getUrl = request.url;
							return HttpResponse.json({
								success: true,
								result: {
									preview_defaults: {
										env: { REMOVE_ME: { type: "secret_text" } },
									},
								},
							});
						}
					),
					http.patch(
						`*/accounts/:accountId/workers/workers/:workerId`,
						({ request }) => {
							patchUrl = request.url;
							return HttpResponse.json({ success: true, result: {} });
						}
					)
				);
				await runWrangler(
					"preview secret delete REMOVE_ME --env staging --skip-confirmation"
				);
				expect(getUrl).toContain("/workers/workers/staging-worker");
				expect(patchUrl).toContain("/workers/workers/staging-worker");
			});
		});

		describe("list", () => {
			test("should list secrets as JSON", async ({ expect }) => {
				msw.use(
					http.get(`*/accounts/:accountId/workers/workers/:workerId`, () =>
						HttpResponse.json({
							success: true,
							result: {
								preview_defaults: {
									env: {
										DB_PASSWORD: { type: "secret_text" },
										API_KEY: { type: "secret_text" },
										PUBLIC_VAR: { type: "plain_text", text: "visible" },
									},
								},
							},
						})
					)
				);
				await runWrangler(
					"preview secret list --json --worker-name test-worker"
				);
				expect(std.out).toContain('"name": "DB_PASSWORD"');
				expect(std.out).toContain('"name": "API_KEY"');
				expect(std.out).not.toContain("PUBLIC_VAR");
			});

			test("should list secrets in pretty format", async ({ expect }) => {
				msw.use(
					http.get(`*/accounts/:accountId/workers/workers/:workerId`, () =>
						HttpResponse.json({
							success: true,
							result: {
								preview_defaults: {
									env: {
										MY_SECRET: { type: "secret_text" },
										PLAIN: { type: "plain_text", text: "not-a-secret" },
									},
								},
							},
						})
					)
				);
				await runWrangler("preview secret list --worker-name test-worker");
				expect(std.out).toContain("Previews settings Secrets:");
				expect(std.out).toContain("MY_SECRET");
				expect(std.out).not.toContain("PLAIN");
			});

			test("should respect env-specific worker name when listing secrets", async ({
				expect,
			}) => {
				writeFileSync(
					"wrangler.json",
					JSON.stringify({
						name: "top-worker",
						main: "src/index.ts",
						compatibility_date: "2025-01-01",
						env: { staging: { name: "staging-worker" } },
					})
				);
				let getUrl: string | undefined;
				msw.use(
					http.get(
						`*/accounts/:accountId/workers/workers/:workerId`,
						({ request }) => {
							getUrl = request.url;
							return HttpResponse.json({
								success: true,
								result: { preview_defaults: { env: {} } },
							});
						}
					)
				);
				await runWrangler("preview secret list --env staging");
				expect(getUrl).toContain("/workers/workers/staging-worker");
			});
		});

		describe("bulk", () => {
			test("should bulk upload secrets to Previews settings", async ({
				expect,
			}) => {
				writeFileSync("secrets.env", "FIRST_KEY=one\nSECOND_KEY=two\n");
				let patchRequestBody:
					| {
							preview_defaults?: {
								env?: Record<string, { type: string; text?: string }>;
							};
					  }
					| undefined;
				msw.use(
					http.get(`*/accounts/:accountId/workers/workers/:workerId`, () =>
						HttpResponse.json({
							success: true,
							result: {
								preview_defaults: {
									env: {
										EXISTING_SECRET: { type: "secret_text" },
										ENVIRONMENT: { type: "plain_text", text: "preview" },
									},
								},
							},
						})
					),
					http.patch(
						`*/accounts/:accountId/workers/workers/:workerId`,
						async ({ request }) => {
							patchRequestBody =
								(await request.json()) as typeof patchRequestBody;
							return HttpResponse.json({ success: true, result: {} });
						}
					)
				);
				await runWrangler("preview secret bulk secrets.env");
				const env = patchRequestBody?.preview_defaults?.env ?? {};
				expect(env).toMatchObject({
					FIRST_KEY: { type: "secret_text", text: "one" },
					SECOND_KEY: { type: "secret_text", text: "two" },
					EXISTING_SECRET: { type: "secret_text" },
					ENVIRONMENT: { type: "plain_text", text: "preview" },
				});
			});

			test("should respect env-specific worker name when bulk uploading secrets", async ({
				expect,
			}) => {
				writeFileSync("secrets.env", "API_KEY=one\n");
				writeFileSync(
					"wrangler.json",
					JSON.stringify({
						name: "top-worker",
						main: "src/index.ts",
						compatibility_date: "2025-01-01",
						env: { staging: { name: "staging-worker" } },
					})
				);
				let getUrl: string | undefined;
				let patchUrl: string | undefined;
				msw.use(
					http.get(
						`*/accounts/:accountId/workers/workers/:workerId`,
						({ request }) => {
							getUrl = request.url;
							return HttpResponse.json({
								success: true,
								result: { preview_defaults: { env: {} } },
							});
						}
					),
					http.patch(
						`*/accounts/:accountId/workers/workers/:workerId`,
						({ request }) => {
							patchUrl = request.url;
							return HttpResponse.json({ success: true, result: {} });
						}
					)
				);
				await runWrangler("preview secret bulk secrets.env --env staging");
				expect(getUrl).toContain("/workers/workers/staging-worker");
				expect(patchUrl).toContain("/workers/workers/staging-worker");
			});
		});
	});
});
