import * as childProcess from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { stripVTControlCharacters } from "node:util";
import { defaultWranglerConfig } from "@cloudflare/workers-utils";
import { http, HttpResponse } from "msw";
import { afterAll, afterEach, beforeEach, describe, test, vi } from "vitest";
import { clearOutputFilePath } from "../output";
import { extractConfigBindings, getBranchName } from "../preview/shared";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { msw } from "./helpers/msw";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import {
	writeRedirectedWranglerConfig,
	writeWranglerConfig,
} from "./helpers/write-wrangler-config";
import type { OutputEntry } from "../output";
import type { Config, PreviewsConfig } from "@cloudflare/workers-utils";

vi.mock("node:child_process", async () => {
	const actual =
		await vi.importActual<typeof childProcess>("node:child_process");
	return {
		...actual,
		execSync: vi.fn(actual.execSync),
	};
});

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
	afterEach(() => {
		clearOutputFilePath();
	});

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
				stream: { binding: "MY_STREAM" },
				version_metadata: { binding: "MY_VERSION_METADATA" },
			});
			const bindings = extractConfigBindings(config);
			expect(bindings).toMatchObject({
				MY_QUEUE: { type: "queue", queue_name: "queue-name" },
				MY_VECTOR: { type: "vectorize", index_name: "idx" },
				MY_HYPERDRIVE: { type: "hyperdrive", id: "hyper-id" },
				MY_AE: { type: "analytics_engine", dataset: "dataset-name" },
				MY_BROWSER: { type: "browser" },
				MY_STREAM: { type: "stream" },
				MY_VERSION_METADATA: { type: "version_metadata" },
			});
		});
	});

	describe("preview command", () => {
		beforeEach(() => {
			vi.stubEnv("CI", undefined);
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
				http.get(`*/accounts/:accountId/workers/workers/:workerId`, () =>
					HttpResponse.json({
						success: true,
						result: {
							preview_defaults: {},
						},
					})
				)
			);
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

		test("should warn about top-level bindings missing from preview settings", async ({
			expect,
		}) => {
			writeFileSync(
				"wrangler.json",
				JSON.stringify({
					name: "test-worker",
					main: "src/index.ts",
					compatibility_date: "2025-01-01",
					kv_namespaces: [{ binding: "IMPORTANT_BINDING", id: "kv-id-123" }],
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
						HttpResponse.json({
							success: true,
							result: {
								id: "preview-id-warning",
								name: "test-preview",
								slug: "test-preview",
								urls: ["https://test-preview.test-worker.cloudflare.app"],
								worker_name: "test-worker",
								created_on: new Date().toISOString(),
							},
						})
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments`,
					() =>
						HttpResponse.json({
							success: true,
							result: {
								id: "deployment-id-warning",
								preview_id: "preview-id-warning",
								preview_name: "test-preview",
								urls: ["https://warn123.test-worker.cloudflare.app"],
								compatibility_date: "2025-01-01",
								env: {},
								created_on: new Date().toISOString(),
							},
						})
				),
				http.get(`*/accounts/:accountId/workers/workers/:workerId`, () =>
					HttpResponse.json({
						success: true,
						result: {
							preview_defaults: {},
						},
					})
				)
			);

			await runWrangler("preview --name test-preview");

			const warningOutput = stripVTControlCharacters(std.warn);
			const normalizedWarningOutput = warningOutput.replace(/\s+/g, " ");

			expect(normalizedWarningOutput).toContain(
				"Your configuration has diverged."
			);
			expect(normalizedWarningOutput).toContain(
				"The following bindings are configured at the top level of your Wrangler config file, but are missing from the Previews settings of your Worker."
			);
			expect(warningOutput).toContain("IMPORTANT_BINDING");
			expect(warningOutput).toContain("KV Namespace");
			expect(normalizedWarningOutput).toContain(
				'Either include these bindings in the "previews" field of your Wrangler config'
			);
			expect(normalizedWarningOutput).toContain(
				"or update the Previews settings of your Worker in the Cloudflare dashboard."
			);
		});

		test("should not warn about top-level bindings when they are present in local previews config", async ({
			expect,
		}) => {
			writeFileSync(
				"wrangler.json",
				JSON.stringify({
					name: "test-worker",
					main: "src/index.ts",
					compatibility_date: "2025-01-01",
					kv_namespaces: [{ binding: "IMPORTANT_BINDING", id: "kv-id-123" }],
					previews: {
						kv_namespaces: [
							{ binding: "IMPORTANT_BINDING", id: "preview-kv-id" },
						],
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
						HttpResponse.json({
							success: true,
							result: {
								id: "preview-id-no-warning",
								name: "test-preview",
								slug: "test-preview",
								urls: ["https://test-preview.test-worker.cloudflare.app"],
								worker_name: "test-worker",
								created_on: new Date().toISOString(),
							},
						})
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments`,
					() =>
						HttpResponse.json({
							success: true,
							result: {
								id: "deployment-id-no-warning",
								preview_id: "preview-id-no-warning",
								preview_name: "test-preview",
								urls: ["https://nowarn123.test-worker.cloudflare.app"],
								compatibility_date: "2025-01-01",
								env: {},
								created_on: new Date().toISOString(),
							},
						})
				),
				http.get(`*/accounts/:accountId/workers/workers/:workerId`, () =>
					HttpResponse.json({
						success: true,
						result: {
							preview_defaults: {},
						},
					})
				)
			);

			await runWrangler("preview --name test-preview");

			expect(std.warn).not.toContain("IMPORTANT_BINDING");
		});

		test("should output preview and deployment JSON with --json", async ({
			expect,
		}) => {
			const outputFile = "./output.json";
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

			await runWrangler("preview --name test-preview --json", {
				...process.env,
				WRANGLER_OUTPUT_FILE_PATH: outputFile,
			});

			expect(std.out).toContain('"preview"');
			expect(std.out).toContain('"deployment"');
			expect(std.out).toContain('"id": "preview-id-json"');
			expect(std.out).toContain('"id": "deployment-id-json"');
			expect(std.out).not.toContain("Preview: test-preview");
			expect(std.out).not.toContain("Deployment:");

			const outputEntries = readFileSync(outputFile, "utf8")
				.split("\n")
				.filter(Boolean)
				.map((line) => JSON.parse(line)) as OutputEntry[];

			expect(outputEntries).toContainEqual(
				expect.objectContaining({
					type: "preview",
					worker_name: "test-worker",
					preview_id: "preview-id-json",
					preview_name: "test-preview",
					preview_slug: "test-preview",
					preview_urls: ["https://test-preview.test-worker.cloudflare.app"],
					deployment_id: "deployment-id-json",
					deployment_urls: ["https://json123.test-worker.cloudflare.app"],
				})
			);
		});

		test("should build correctly when using a redirected config", async ({
			expect,
		}) => {
			mkdirSync("src/lib", { recursive: true });
			mkdirSync("dist", { recursive: true });
			writeFileSync(
				"src/lib/message.ts",
				'export const MESSAGE = "redirected-message";'
			);
			writeFileSync(
				"src/index.ts",
				'do { } while (false); import { MESSAGE } from "#lib/message"; export default { fetch() { return new Response(MESSAGE); } };'
			);
			writeFileSync(
				"tsconfig.json",
				JSON.stringify({
					compilerOptions: {
						baseUrl: ".",
						paths: {
							"#lib/*": ["src/lib/*"],
						},
					},
				})
			);
			writeWranglerConfig(
				{
					name: "test-worker",
					main: "./src/index.ts",
				},
				"./wrangler.json"
			);
			writeRedirectedWranglerConfig(
				{
					name: "test-worker",
					main: "../src/index.ts",
					userConfigPath: "./wrangler.json",
				},
				"./dist/wrangler.json"
			);

			let deploymentRequestBody:
				| {
						main_module?: string;
						modules?: Array<{
							name: string;
							content_base64: string;
						}>;
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
					() =>
						HttpResponse.json({
							success: true,
							result: {
								id: "preview-id-redirected",
								name: "test-preview",
								slug: "test-preview",
								urls: ["https://test-preview.test-worker.cloudflare.app"],
								worker_name: "test-worker",
								created_on: new Date().toISOString(),
							},
						})
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments`,
					async ({ request }) => {
						deploymentRequestBody =
							(await request.json()) as typeof deploymentRequestBody;
						return HttpResponse.json({
							success: true,
							result: {
								id: "deployment-id-redirected",
								preview_id: "preview-id-redirected",
								preview_name: "test-preview",
								urls: ["https://redirected123.test-worker.cloudflare.app"],
								compatibility_date: "2025-01-01",
								env: {},
								created_on: new Date().toISOString(),
							},
						});
					}
				)
			);

			await runWrangler("preview --name test-preview");

			const mainModule = deploymentRequestBody?.modules?.find(
				(module) => module.name === deploymentRequestBody?.main_module
			);
			const code = Buffer.from(
				mainModule?.content_base64 ?? "",
				"base64"
			).toString("utf8");

			expect(code).toContain("redirected-message");
		});

		test("should include dist/server chunks when using a vite no-bundle redirected config", async ({
			expect,
		}) => {
			mkdirSync("dist/server/chunks", { recursive: true });
			mkdirSync("dist/client", { recursive: true });
			mkdirSync(".wrangler/deploy", { recursive: true });
			writeFileSync(
				"dist/server/entry.mjs",
				'import { MESSAGE } from "./chunks/chunk.mjs"; export default { fetch() { return new Response(MESSAGE); } };'
			);
			writeFileSync(
				"dist/server/chunks/chunk.mjs",
				'export const MESSAGE = "chunk-message";'
			);
			writeFileSync(
				"wrangler.jsonc",
				JSON.stringify({
					name: "entry-worker",
					main: "./src/index.ts",
					compatibility_date: "2025-01-01",
				})
			);
			writeFileSync(
				"dist/server/wrangler.json",
				JSON.stringify({
					configPath: "/Users/cina/src/github/example/project/wrangler.jsonc",
					userConfigPath:
						"/Users/cina/src/github/example/project/wrangler.jsonc",
					topLevelName: "entry-worker",
					definedEnvironments: [],
					legacy_env: true,
					compatibility_date: "2025-01-01",
					compatibility_flags: ["nodejs_compat"],
					rules: [{ type: "ESModule", globs: ["**/*.mjs"] }],
					name: "entry-worker",
					main: "entry.mjs",
					triggers: {},
					assets: { binding: "ASSETS", directory: "../client" },
					vars: {},
					durable_objects: { bindings: [] },
					workflows: [],
					migrations: [],
					kv_namespaces: [],
					cloudchamber: {},
					send_email: [],
					queues: { producers: [], consumers: [] },
					r2_buckets: [],
					d1_databases: [],
					vectorize: [],
					ai_search_namespaces: [],
					ai_search: [],
					hyperdrive: [],
					services: [],
					analytics_engine_datasets: [],
					dispatch_namespaces: [],
					mtls_certificates: [],
					images: { binding: "IMAGES" },
					pipelines: [],
					secrets_store_secrets: [],
					unsafe_hello_world: [],
					worker_loaders: [],
					ratelimits: [],
					vpc_services: [],
					logfwdr: { bindings: [] },
					observability: { enabled: true },
					python_modules: { exclude: ["**/*.pyc"] },
					dev: {
						ip: "localhost",
						local_protocol: "http",
						upstream_protocol: "http",
						enable_containers: true,
						generate_types: false,
					},
					no_bundle: true,
				})
			);
			writeFileSync(
				".wrangler/deploy/config.json",
				JSON.stringify({
					configPath: "../../dist/server/wrangler.json",
					auxiliaryWorkers: [],
					prerenderWorkerConfigPath:
						"../../dist/server/.prerender/wrangler.json",
				})
			);

			let deploymentRequestBody:
				| {
						main_module?: string;
						modules?: Array<{
							name: string;
							content_base64: string;
						}>;
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
					`*/accounts/:accountId/workers/scripts/:workerId/assets-upload-session`,
					() =>
						HttpResponse.json({
							success: true,
							result: {
								buckets: [],
								jwt: "assets-jwt-from-session",
							},
						})
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews`,
					() =>
						HttpResponse.json({
							success: true,
							result: {
								id: "preview-id-vite-nobundle",
								name: "test-preview",
								slug: "test-preview",
								urls: ["https://test-preview.entry-worker.cloudflare.app"],
								worker_name: "entry-worker",
								created_on: new Date().toISOString(),
							},
						})
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments`,
					async ({ request }) => {
						deploymentRequestBody =
							(await request.json()) as typeof deploymentRequestBody;
						return HttpResponse.json({
							success: true,
							result: {
								id: "deployment-id-vite-nobundle",
								preview_id: "preview-id-vite-nobundle",
								preview_name: "test-preview",
								urls: ["https://vite-nobundle.entry-worker.cloudflare.app"],
								compatibility_date: "2025-01-01",
								env: {},
								created_on: new Date().toISOString(),
							},
						});
					}
				)
			);

			await runWrangler("preview --name test-preview");

			expect(deploymentRequestBody?.main_module).toBe("entry.mjs");
			expect(deploymentRequestBody?.modules).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ name: "chunks/chunk.mjs" }),
				])
			);
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

		test("should include previews tail_consumers in the preview resource request", async ({
			expect,
		}) => {
			writeFileSync(
				"wrangler.json",
				JSON.stringify({
					name: "test-worker",
					main: "src/index.ts",
					compatibility_date: "2025-01-01",
					previews: {
						tail_consumers: [{ service: "tail-worker" }],
					},
				})
			);

			let createPreviewRequestBody:
				| {
						name?: string;
						tail_consumers?: Array<{ service: string; environment?: string }>;
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
									id: "preview-id-tail-consumers",
									name: "test-preview",
									slug: "test-preview",
									urls: ["https://test-preview.test-worker.cloudflare.app"],
									worker_name: "test-worker",
									tail_consumers: [{ name: "tail-worker" }],
									created_on: new Date().toISOString(),
								},
							},
							{ status: 201 }
						);
					}
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments`,
					() =>
						HttpResponse.json(
							{
								success: true,
								result: {
									id: "deployment-id-tail-consumers",
									preview_id: "preview-id-tail-consumers",
									preview_name: "test-preview",
									urls: ["https://tail123.test-worker.cloudflare.app"],
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

			expect(createPreviewRequestBody?.tail_consumers).toEqual([
				{ name: "tail-worker" },
			]);
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

		test("should use previews.define for worker bundling", async ({
			expect,
		}) => {
			writeFileSync(
				"src/index.ts",
				"export default { fetch() { return new Response(PREVIEW_FLAG); } };"
			);
			writeFileSync(
				"wrangler.json",
				JSON.stringify({
					name: "test-worker",
					main: "src/index.ts",
					compatibility_date: "2025-01-01",
					define: { PREVIEW_FLAG: '"top-level"' },
					previews: {
						define: { PREVIEW_FLAG: '"preview-value"' },
					},
				})
			);

			let deploymentRequestBody:
				| {
						main_module?: string;
						modules?: Array<{
							name: string;
							content_base64: string;
						}>;
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
					() =>
						HttpResponse.json({
							success: true,
							result: {
								id: "preview-id-define",
								name: "test-preview",
								slug: "test-preview",
								urls: ["https://test-preview.test-worker.cloudflare.app"],
								worker_name: "test-worker",
								created_on: new Date().toISOString(),
							},
						})
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments`,
					async ({ request }) => {
						deploymentRequestBody =
							(await request.json()) as typeof deploymentRequestBody;
						return HttpResponse.json({
							success: true,
							result: {
								id: "deployment-id-define",
								preview_id: "preview-id-define",
								preview_name: "test-preview",
								urls: ["https://define123.test-worker.cloudflare.app"],
								compatibility_date: "2025-01-01",
								env: {},
								created_on: new Date().toISOString(),
							},
						});
					}
				)
			);

			await runWrangler("preview --name test-preview");

			const mainModule = deploymentRequestBody?.modules?.find(
				(module) => module.name === deploymentRequestBody?.main_module
			);
			const code = Buffer.from(
				mainModule?.content_base64 ?? "",
				"base64"
			).toString("utf8");
			expect(code).toContain("preview-value");
			expect(code).not.toContain("top-level");
		});

		test("should use previews durable_objects for export validation", async ({
			expect,
		}) => {
			writeFileSync(
				"src/index.ts",
				"export class PreviewCounter { fetch() { return new Response('ok'); } } export default { fetch() { return new Response('ok'); } };"
			);
			writeFileSync(
				"wrangler.json",
				JSON.stringify({
					name: "test-worker",
					main: "src/index.ts",
					compatibility_date: "2025-01-01",
					durable_objects: {
						bindings: [{ name: "COUNTER", class_name: "MissingCounter" }],
					},
					previews: {
						durable_objects: {
							bindings: [{ name: "COUNTER", class_name: "PreviewCounter" }],
						},
					},
				})
			);

			let deploymentRequestBody:
				| {
						env?: Record<
							string,
							{ type: string; class_name?: string; script_name?: string }
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
					() =>
						HttpResponse.json({
							success: true,
							result: {
								id: "preview-id-do",
								name: "test-preview",
								slug: "test-preview",
								urls: ["https://test-preview.test-worker.cloudflare.app"],
								worker_name: "test-worker",
								created_on: new Date().toISOString(),
							},
						})
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments`,
					async ({ request }) => {
						deploymentRequestBody =
							(await request.json()) as typeof deploymentRequestBody;
						return HttpResponse.json({
							success: true,
							result: {
								id: "deployment-id-do",
								preview_id: "preview-id-do",
								preview_name: "test-preview",
								urls: ["https://do123.test-worker.cloudflare.app"],
								compatibility_date: "2025-01-01",
								env: {},
								created_on: new Date().toISOString(),
							},
						});
					}
				)
			);

			await runWrangler("preview --name test-preview");

			expect(deploymentRequestBody?.env?.COUNTER).toMatchObject({
				type: "durable_object_namespace",
				class_name: "PreviewCounter",
			});
			expect(deploymentRequestBody?.env?.COUNTER).not.toMatchObject({
				class_name: "MissingCounter",
			});
		});

		test("should use previews workflows for export validation", async ({
			expect,
		}) => {
			writeFileSync(
				"src/index.ts",
				"export class PreviewWorkflow {} export default { fetch() { return new Response('ok'); } };"
			);
			writeFileSync(
				"wrangler.json",
				JSON.stringify({
					name: "test-worker",
					main: "src/index.ts",
					compatibility_date: "2025-01-01",
					workflows: [
						{ binding: "WF", name: "top", class_name: "MissingWorkflow" },
					],
					previews: {
						workflows: [
							{ binding: "WF", name: "preview", class_name: "PreviewWorkflow" },
						],
					},
				})
			);

			let deploymentRequestBody:
				| {
						env?: Record<
							string,
							{ type: string; class_name?: string; workflow_name?: string }
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
					() =>
						HttpResponse.json({
							success: true,
							result: {
								id: "preview-id-workflow",
								name: "test-preview",
								slug: "test-preview",
								urls: ["https://test-preview.test-worker.cloudflare.app"],
								worker_name: "test-worker",
								created_on: new Date().toISOString(),
							},
						})
				),
				http.post(
					`*/accounts/:accountId/workers/workers/:workerId/previews/:previewId/deployments`,
					async ({ request }) => {
						deploymentRequestBody =
							(await request.json()) as typeof deploymentRequestBody;
						return HttpResponse.json({
							success: true,
							result: {
								id: "deployment-id-workflow",
								preview_id: "preview-id-workflow",
								preview_name: "test-preview",
								urls: ["https://workflow123.test-worker.cloudflare.app"],
								compatibility_date: "2025-01-01",
								env: {},
								created_on: new Date().toISOString(),
							},
						});
					}
				)
			);

			await runWrangler("preview --name test-preview");

			expect(deploymentRequestBody?.env?.WF).toMatchObject({
				type: "workflow",
				class_name: "PreviewWorkflow",
				workflow_name: "preview",
			});
			expect(deploymentRequestBody?.env?.WF).not.toMatchObject({
				class_name: "MissingWorkflow",
				workflow_name: "top",
			});
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

		test("should fall back to HEAD commit metadata for annotations in CI", async ({
			expect,
		}) => {
			vi.stubEnv("CI", "true");
			vi.mocked(childProcess.execSync)
				.mockImplementationOnce(() => Buffer.from("true"))
				.mockImplementationOnce(() => Buffer.from("abc123def456\n"))
				.mockImplementationOnce(() => Buffer.from("true"))
				.mockImplementationOnce(() => Buffer.from("my commit message\n"));

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
									id: "preview-id-ci-annotations",
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
									id: "deployment-id-ci-annotations",
									preview_id: "preview-id-ci-annotations",
									preview_name: "test-preview",
									urls: ["https://ci123.test-worker.cloudflare.app"],
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

			expect(deploymentRequestBody?.annotations).toEqual({
				"workers/message": "my commit message",
				"workers/tag": "abc123def456",
			});
			vi.unstubAllEnvs();
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
					limits: { cpu_ms: 100, subrequests: 200 },
					previews: {
						observability: { enabled: true },
						vars: { TOP_LEVEL_PREVIEW: "top-value" },
						kv_namespaces: [{ binding: "TOP_KV", id: "top-kv-id" }],
						limits: { cpu_ms: 25, subrequests: 125 },
					},
					env: {
						staging: {
							previews: {
								observability: { enabled: false },
								vars: { STAGE_PREVIEW: "stage-value" },
								queues: {
									producers: [{ binding: "STAGE_QUEUE", queue: "jobs" }],
								},
								limits: { subrequests: 50 },
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
						limits?: { cpu_ms?: number; subrequests?: number };
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
			expect(deploymentRequestBody?.limits).toEqual({ subrequests: 50 });
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
});
