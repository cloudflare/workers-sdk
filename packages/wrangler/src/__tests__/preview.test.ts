import { mkdirSync, writeFileSync } from "node:fs";
import { defaultWranglerConfig } from "@cloudflare/workers-utils";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, test } from "vitest";
import { extractConfigBindings } from "../preview/shared";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { msw } from "./helpers/msw";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import type { Config, PreviewsConfig } from "@cloudflare/workers-utils";

// Helper to create a partial Config with previews for testing
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

	describe("extractConfigBindings", () => {
		test("should extract vars as plain_text bindings", ({ expect }) => {
			const config = configWithPreviews({
				vars: {
					VAR1: "value1",
					VAR2: "value2",
				},
			});

			const bindings = extractConfigBindings(config);

			expect(bindings).toMatchObject({
				VAR1: {
					type: "plain_text",
					text: "value1",
				},
				VAR2: {
					type: "plain_text",
					text: "value2",
				},
			});
		});

		test("should extract kv_namespaces", ({ expect }) => {
			const config = configWithPreviews({
				kv_namespaces: [{ binding: "MY_KV", id: "kv-id-123" }],
			});

			const bindings = extractConfigBindings(config);

			expect(bindings).toMatchObject({
				MY_KV: {
					type: "kv_namespace",
					namespace_id: "kv-id-123",
				},
			});
		});

		test("should extract d1_databases", ({ expect }) => {
			const config = configWithPreviews({
				d1_databases: [
					{
						binding: "DB",
						database_id: "db-id-123",
						database_name: "my-db",
					},
				],
			});

			const bindings = extractConfigBindings(config);

			expect(bindings).toMatchObject({
				DB: {
					type: "d1",
					database_id: "db-id-123",
					database_name: "my-db",
				},
			});
		});

		test("should extract r2_buckets", ({ expect }) => {
			const config = configWithPreviews({
				r2_buckets: [{ binding: "BUCKET", bucket_name: "my-bucket" }],
			});

			const bindings = extractConfigBindings(config);

			expect(bindings).toMatchObject({
				BUCKET: {
					type: "r2_bucket",
					bucket_name: "my-bucket",
				},
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
				API: {
					type: "service",
					service: "api-worker",
					entrypoint: "default",
				},
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

		test("should return empty array when no previews block", ({ expect }) => {
			const config = {
				...defaultWranglerConfig,
				previews: undefined,
			};

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

	describe("command integration", () => {
		beforeEach(() => {
			mkdirSync("src", { recursive: true });
			writeFileSync(
				"src/index.ts",
				"export default { fetch() { return new Response('ok'); } };"
			);

			// Create wrangler.json
			writeFileSync(
				"wrangler.json",
				JSON.stringify({
					name: "test-worker",
					main: "src/index.ts",
					compatibility_date: "2025-01-01",
					previews: {
						vars: {
							ENVIRONMENT: "preview",
						},
						kv_namespaces: [{ binding: "MY_KV", id: "preview-kv-id" }],
					},
				})
			);
			msw.resetHandlers();
		});

		test("should create a new preview with defaults applied", async ({
			expect,
		}) => {
			let lookupPreviewUrl: string | undefined;

			// Mock API responses
			msw.use(
				// Preview doesn't exist yet
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
				// Create preview
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
				// Create deployment
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
										DEFAULT_VAR: {
											type: "plain_text",
											text: "from-defaults",
										},
										ENVIRONMENT: {
											type: "plain_text",
											text: "preview",
										},
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

			// Check output shows preview and deployment info
			expect(std.out).toContain("Preview: test-preview (new)");
			expect(std.out).toContain("Deployment:");
			// Check bindings are shown with values
			expect(std.out).toContain("DEFAULT_VAR");
			expect(std.out).toContain('"from-defaults"');
			expect(std.out).toContain("ENVIRONMENT");
			expect(std.out).toContain('"preview"');
			expect(std.out).toContain("MY_KV");
			expect(std.out).toContain("preview-kv-id");
			// Check config marker and footnote
			expect(std.out).toContain("◆");
			expect(std.out).toContain("◆ from wrangler.json");
		});

		test("should show existing preview status for existing preview", async ({
			expect,
		}) => {
			// Mock API responses
			msw.use(
				// Preview exists
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
				// Create deployment
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

			// Should show Preview with (updated) status
			expect(std.out).toContain("Preview: test-preview");
			expect(std.out).toContain("(updated)");
			// Should still create deployment
			expect(std.out).toContain("Deployment:");
		});

		test("should work without preview_defaults", async ({ expect }) => {
			// Mock API responses
			msw.use(
				// Preview doesn't exist
				http.get(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId`,
					() => {
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
				// Create preview
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews`,
					() => {
						return HttpResponse.json(
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
						);
					}
				),
				// Create deployment
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments`,
					() => {
						return HttpResponse.json(
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
						);
					}
				)
			);

			await runWrangler("preview --name no-defaults-preview");

			// Should still create preview and deployment
			expect(std.out).toContain("Preview: no-defaults-preview (new)");
			expect(std.out).toContain("Deployment:");
			// Only config bindings should appear with markers
			expect(std.out).toContain("ENVIRONMENT");
			expect(std.out).toContain("MY_KV");
			expect(std.out).toContain("◆ from wrangler.json");
		});

		test("should show observability settings when configured", async ({
			expect,
		}) => {
			// Update wrangler.json to include observability in previews
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

			// Mock API responses
			msw.use(
				// Preview doesn't exist
				http.get(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId`,
					() => {
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
				// Create preview with observability
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews`,
					() => {
						return HttpResponse.json(
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
						);
					}
				),
				// Create deployment
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments`,
					() => {
						return HttpResponse.json(
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
						);
					}
				)
			);

			await runWrangler("preview --name test-preview");

			expect(std.out).toContain("observability");
			expect(std.out).toContain("enabled");
		});

		test("should show compatibility_date when configured", async ({
			expect,
		}) => {
			// Mock API responses
			msw.use(
				// Preview doesn't exist
				http.get(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId`,
					() => {
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
				// Create preview
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews`,
					() => {
						return HttpResponse.json(
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
						);
					}
				),
				// Create deployment with compatibility_date
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments`,
					() => {
						return HttpResponse.json(
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
						);
					}
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

			// Mock API responses and capture URLs
			msw.use(
				// Preview doesn't exist
				http.get(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId`,
					() => {
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
				// Create preview - capture URL to verify query param
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
				// Create deployment - capture URL to verify query param
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

			// Verify query params were included in preview and deployment API calls
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
					() => {
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
									id: "preview-id-assets",
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
					`*/accounts/:accountId/workers/scripts/:workerId/assets-upload-session`,
					async ({ request }) => {
						uploadSessionUrl = request.url;
						const body = (await request.json()) as { manifest?: unknown };
						expect(body.manifest).toBeDefined();
						return HttpResponse.json({
							success: true,
							result: {
								buckets: [],
								jwt: "assets-jwt-from-session",
							},
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
				config: {
					run_worker_first: true,
				},
			});
			expect(deploymentRequestBody?.main_module).toBeDefined();
			expect(Array.isArray(deploymentRequestBody?.modules)).toBe(true);
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
				http.get(`*/accounts/:accountId/workers/workers/:workerId`, () => {
					return HttpResponse.json({
						success: true,
						result: {
							preview_defaults: {
								observability: { enabled: true, head_sampling_rate: 1 },
								logpush: false,
								env: { OLD: { type: "plain_text", text: "value" } },
							},
						},
					});
				}),
				http.patch(
					`*/accounts/:accountId/workers/workers/:workerId`,
					async ({ request }) => {
						patchCalled = true;
						patchRequestBody = (await request.json()) as {
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
						};
						return HttpResponse.json({ success: true, result: {} });
					}
				)
			);

			await runWrangler(
				"preview settings update --worker-name override-worker --skip-confirmation"
			);

			expect(patchRequestBody?.preview_defaults?.compatibility_date).toBe(
				"2025-01-01"
			);
			expect(patchCalled).toBe(true);
			expect(std.out).not.toContain("observability:");
			expect(std.out).not.toContain(
				'Apply these Previews settings changes to Worker "override-worker"?'
			);
			expect(std.out).toContain(
				"✨ Updated Previews settings for Worker override-worker."
			);
			expect(std.out).toContain("Worker: override-worker");
			expect(std.out).toContain("Previews settings");
			expect(patchRequestBody?.preview_defaults?.observability).toEqual({
				enabled: true,
				head_sampling_rate: 1,
			});
			expect(patchRequestBody?.preview_defaults?.logpush).toBe(false);
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
					previews: {
						observability: { enabled: true },
					},
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
				http.get(`*/accounts/:accountId/workers/workers/:workerId`, () => {
					return HttpResponse.json({
						success: true,
						result: {
							preview_defaults: {
								observability: { enabled: false, head_sampling_rate: 0.25 },
							},
						},
					});
				}),
				http.patch(
					`*/accounts/:accountId/workers/workers/:workerId`,
					async ({ request }) => {
						patchRequestBody = (await request.json()) as {
							preview_defaults?: {
								observability?: {
									enabled?: boolean;
									head_sampling_rate?: number;
								};
							};
						};
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
			let patchRequestBody:
				| {
						preview_defaults?: {
							compatibility_date?: string;
						};
				  }
				| undefined;

			msw.use(
				http.get(`*/accounts/:accountId/workers/workers/:workerId`, () => {
					return HttpResponse.json({
						success: true,
						result: {
							preview_defaults: {
								compatibility_date: "2024-12-31",
							},
						},
					});
				}),
				http.patch(
					`*/accounts/:accountId/workers/workers/:workerId`,
					async ({ request }) => {
						patchRequestBody = (await request.json()) as {
							preview_defaults?: {
								compatibility_date?: string;
							};
						};
						return HttpResponse.json({
							success: true,
							result: {
								preview_defaults: {
									compatibility_date: "2025-02-02",
								},
							},
						});
					}
				)
			);

			await runWrangler(
				"preview settings update --worker-name override-worker --skip-confirmation"
			);

			expect(patchRequestBody?.preview_defaults?.compatibility_date).toBe(
				"2025-01-01"
			);
			expect(std.out).toContain("Worker: override-worker");
			expect(std.out).toContain("Previews settings");
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
					previews: {
						limits: { cpu_ms: 50 },
					},
				})
			);

			let patchRequestBody:
				| {
						preview_defaults?: {
							limits?: { cpu_ms?: number };
						};
				  }
				| undefined;

			msw.use(
				http.get(`*/accounts/:accountId/workers/workers/:workerId`, () => {
					return HttpResponse.json({
						success: true,
						result: { preview_defaults: {} },
					});
				}),
				http.patch(
					`*/accounts/:accountId/workers/workers/:workerId`,
					async ({ request }) => {
						patchRequestBody = (await request.json()) as {
							preview_defaults?: {
								limits?: { cpu_ms?: number };
							};
						};
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
				http.get(`*/accounts/:accountId/workers/workers/:workerId`, () => {
					return HttpResponse.json({
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
					});
				}),
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

		test("should list current preview settings", async ({ expect }) => {
			msw.use(
				http.get(`*/accounts/:accountId/workers/workers/:workerId`, () => {
					return HttpResponse.json({
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
					});
				})
			);

			await runWrangler(
				"preview settings --worker-name override-worker --format json"
			);

			expect(std.out).toContain('"compatibility_date": "2025-01-01"');
			expect(std.out).toContain('"ENVIRONMENT"');
		});

		test("should list current Previews settings in pretty format", async ({
			expect,
		}) => {
			msw.use(
				http.get(`*/accounts/:accountId/workers/workers/:workerId`, () => {
					return HttpResponse.json({
						success: true,
						result: {
							preview_defaults: {
								compatibility_date: "2025-01-01",
								compatibility_flags: ["nodejs_compat"],
								observability: {
									enabled: true,
									head_sampling_rate: 0.5,
								},
								logpush: false,
								limits: {
									cpu_ms: 50,
								},
								placement: {
									mode: "smart",
								},
								env: {
									ENVIRONMENT: { type: "plain_text", text: "preview" },
									API_KEY: { type: "secret_text" },
								},
							},
						},
					});
				})
			);

			await runWrangler("preview settings --worker-name override-worker");

			expect(std.out).toContain("Worker: override-worker");
			expect(std.out).toContain("Previews settings");
			expect(std.out).toContain("compatibility_date");
			expect(std.out).toContain("2025-01-01");
			expect(std.out).toContain("compatibility_flags");
			expect(std.out).toContain("nodejs_compat");
			expect(std.out).toContain("observability");
			expect(std.out).toContain("enabled, 0.5 sampling");
			expect(std.out).toContain("logpush");
			expect(std.out).toContain("disabled");
			expect(std.out).toContain("limits");
			expect(std.out).toContain("cpu_ms 50");
			expect(std.out).toContain("placement");
			expect(std.out).toContain("smart");
			expect(std.out).toContain("Bindings");
			expect(std.out).toContain("ENVIRONMENT");
			expect(std.out).toContain("preview");
			expect(std.out).toContain("API_KEY");
			expect(std.out).toContain("********");
			expect(std.out).toContain("╭");
			expect(std.out).toContain("╰");
		});

		test("should show empty bindings in pretty format", async ({ expect }) => {
			msw.use(
				http.get(`*/accounts/:accountId/workers/workers/:workerId`, () => {
					return HttpResponse.json({
						success: true,
						result: {
							preview_defaults: {
								compatibility_date: "2025-01-01",
								env: {},
							},
						},
					});
				})
			);

			await runWrangler("preview settings --worker-name override-worker");

			expect(std.out).toContain("Bindings");
			expect(std.out).toContain("(none)");
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
					previews: {
						logpush: false,
					},
				})
			);

			let patchCalled = false;
			let patchRequestBody:
				| {
						preview_defaults?: {
							env?: Record<string, { type: string; text?: string }>;
							logpush?: boolean;
						};
				  }
				| undefined;

			msw.use(
				http.get(`*/accounts/:accountId/workers/workers/:workerId`, () => {
					return HttpResponse.json({
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
					});
				}),
				http.patch(
					`*/accounts/:accountId/workers/workers/:workerId`,
					async ({ request }) => {
						patchCalled = true;
						patchRequestBody = (await request.json()) as {
							preview_defaults?: {
								env?: Record<string, { type: string; text?: string }>;
								logpush?: boolean;
							};
						};
						return HttpResponse.json({ success: true, result: {} });
					}
				)
			);

			await runWrangler(
				"preview settings update --worker-name override-worker"
			);

			expect(patchCalled).toBe(true);
			expect(patchRequestBody?.preview_defaults?.logpush).toBe(false);
			expect(patchRequestBody?.preview_defaults?.env).toMatchObject({
				EXISTING_SECRET: { type: "plain_text", text: "value" },
			});
		});

		test("should replace binding entries wholesale when type changes", async ({
			expect,
		}) => {
			// Remote has a kv_namespace binding; config redefines it as plain_text.
			// After merge, the binding should be pure plain_text with no leftover namespace_id.
			writeFileSync(
				"wrangler.json",
				JSON.stringify({
					name: "test-worker",
					main: "src/index.ts",
					compatibility_date: "2025-01-01",
					previews: {
						vars: {
							MY_BINDING: "new-value",
						},
					},
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
				http.get(`*/accounts/:accountId/workers/workers/:workerId`, () => {
					return HttpResponse.json({
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
					});
				}),
				http.patch(
					`*/accounts/:accountId/workers/workers/:workerId`,
					async ({ request }) => {
						patchRequestBody = (await request.json()) as {
							preview_defaults?: {
								env?: Record<string, Record<string, unknown>>;
							};
						};
						return HttpResponse.json({ success: true, result: {} });
					}
				)
			);

			await runWrangler(
				"preview settings update --worker-name override-worker --skip-confirmation"
			);

			const binding = patchRequestBody?.preview_defaults?.env?.MY_BINDING;
			expect(binding).toBeDefined();
			expect(binding?.type).toBe("plain_text");
			expect(binding?.text).toBe("new-value");
			// Stale property from old kv_namespace binding must not leak through
			expect(binding?.namespace_id).toBeUndefined();
		});

		test("should list preview secrets from the latest deployment", async ({
			expect,
		}) => {
			let latestDeploymentUrl: string | undefined;

			msw.use(
				http.get(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId`,
					() => {
						return HttpResponse.json({
							success: true,
							result: {
								id: "preview-id-secrets-list",
								name: "test-preview",
								slug: "test-preview",
								urls: ["https://test-preview.test-worker.cloudflare.app"],
								worker_name: "test-worker",
								created_on: new Date().toISOString(),
								updated_on: new Date().toISOString(),
							},
						});
					}
				),
				http.get(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments/latest`,
					({ request }) => {
						latestDeploymentUrl = request.url;
						return HttpResponse.json({
							success: true,
							result: {
								id: "deployment-id-secrets-list",
								preview_id: "preview-id-secrets-list",
								preview_name: "test-preview",
								urls: ["https://list123.test-worker.cloudflare.app"],
								env: {
									API_KEY: { type: "secret_text" },
									ENVIRONMENT: { type: "plain_text", text: "preview" },
								},
								created_on: new Date().toISOString(),
							},
						});
					}
				)
			);

			await runWrangler(
				"preview secret list --name test-preview --format json --worker-name override-worker"
			);

			expect(std.out).toContain('"name": "API_KEY"');
			expect(std.out).toContain('"type": "secret_text"');
			expect(std.out).not.toContain("ENVIRONMENT");
			expect(latestDeploymentUrl).toContain(
				"/workers/workers/override-worker/previews/"
			);
		});

		test("should delete a preview secret by creating a new deployment", async ({
			expect,
		}) => {
			let deploymentRequestBody:
				| { env?: Record<string, { type: string; text?: string }> }
				| undefined;

			msw.use(
				http.get(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId`,
					() => {
						return HttpResponse.json({
							success: true,
							result: {
								id: "preview-id-secrets-delete",
								name: "test-preview",
								slug: "test-preview",
								urls: ["https://test-preview.test-worker.cloudflare.app"],
								worker_name: "test-worker",
								created_on: new Date().toISOString(),
								updated_on: new Date().toISOString(),
							},
						});
					}
				),
				http.get(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments/latest`,
					() => {
						return HttpResponse.json({
							success: true,
							result: {
								id: "deployment-id-secrets-delete",
								preview_id: "preview-id-secrets-delete",
								preview_name: "test-preview",
								urls: ["https://delete123.test-worker.cloudflare.app"],
								env: {
									KEEP_ME: { type: "secret_text" },
									REMOVE_ME: { type: "secret_text" },
									ENVIRONMENT: { type: "plain_text", text: "preview" },
								},
								created_on: new Date().toISOString(),
							},
						});
					}
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments`,
					async ({ request }) => {
						deploymentRequestBody = (await request.json()) as {
							env?: Record<string, { type: string; text?: string }>;
						};
						return HttpResponse.json({
							success: true,
							result: {
								id: "deployment-id-secrets-delete-new",
								preview_id: "preview-id-secrets-delete",
								preview_name: "test-preview",
								urls: ["https://delete456.test-worker.cloudflare.app"],
								env: deploymentRequestBody?.env ?? {},
								created_on: new Date().toISOString(),
							},
						});
					}
				)
			);

			await runWrangler(
				"preview secret delete REMOVE_ME --name test-preview --skip-confirmation"
			);

			const bindingNames = Object.keys(deploymentRequestBody?.env ?? {});
			expect(bindingNames).toContain("KEEP_ME");
			expect(bindingNames).toContain("ENVIRONMENT");
			expect(bindingNames).not.toContain("REMOVE_ME");
		});

		test("should bulk upload secrets to preview defaults", async ({
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
				http.get(`*/accounts/:accountId/workers/workers/:workerId`, () => {
					return HttpResponse.json({
						success: true,
						result: {
							preview_defaults: {
								env: {
									EXISTING_SECRET: { type: "secret_text" },
									ENVIRONMENT: { type: "plain_text", text: "preview" },
								},
							},
						},
					});
				}),
				http.patch(
					`*/accounts/:accountId/workers/workers/:workerId`,
					async ({ request }) => {
						patchRequestBody = (await request.json()) as {
							preview_defaults?: {
								env?: Record<string, { type: string; text?: string }>;
							};
						};
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
	});
});
