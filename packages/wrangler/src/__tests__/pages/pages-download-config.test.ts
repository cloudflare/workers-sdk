import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { writeWranglerConfig } from "@cloudflare/workers-utils/test-helpers";
import { supportedCompatibilityDate } from "miniflare";
import { http, HttpResponse } from "msw";
/* eslint-disable workers-sdk/no-vitest-import-expect -- expect used in MSW handlers */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
/* eslint-enable workers-sdk/no-vitest-import-expect */
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { clearDialogs, mockConfirm } from "../helpers/mock-dialogs";
import { useMockIsTTY } from "../helpers/mock-istty";
import { msw } from "../helpers/msw";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";

async function readNormalizedWranglerToml() {
	return (await readFile("wrangler.toml", "utf8"))
		.split("\n")
		.slice(1)
		.join("\n")
		.replace(supportedCompatibilityDate, "LATEST-SUPPORTED");
}
function makePagesProject(
	previewOverride: Record<string, unknown> = {},
	productionOverride: Record<string, unknown> = {}
) {
	return {
		success: true,
		errors: [],
		result: {
			id: randomUUID(),
			name: "some-project",
			subdomain: `some-project.pages.dev`,
			domains: [`some-project.pages.dev`],
			source: {
				type: "github",
				config: {
					owner: "workers-devprod",
					repo_name: "some-project",
					production_branch: "main",
					pr_comments_enabled: true,
					deployments_enabled: true,
					production_deployments_enabled: true,
					preview_deployment_setting: "all",
					preview_branch_includes: ["*"],
					preview_branch_excludes: [],
					path_includes: ["*"],
					path_excludes: [],
				},
			},
			build_config: {
				build_command: 'node -e "console.log(process.env)"',
				destination_dir: "dist-test",
				root_dir: "",
				web_analytics_tag: null,
				web_analytics_token: null,
			},
			deployment_configs: {
				preview: {
					env_vars: {
						TEST_JSON_PREVIEW: {
							type: "plain_text",
							value: '{\njson: "value"\n}',
						},
						TEST_PLAINTEXT_PREVIEW: {
							type: "plain_text",
							value: "PLAINTEXT",
						},
						TEST_SECRET_PREVIEW: {
							type: "secret_text",
							value: "",
						},
						TEST_SECRET_2_PREVIEW: {
							type: "secret_text",
							value: "",
						},
					},
					kv_namespaces: {
						KV_PREVIEW: {
							namespace_id: "kv-id",
						},
						KV_PREVIEW2: {
							namespace_id: "kv-id",
						},
					},
					durable_object_namespaces: {
						DO_PREVIEW: {
							namespace_id: "do-id",
						},
						DO_PREVIEW2: {
							namespace_id: "do-id",
						},
						DO_PREVIEW3: {
							class_name: "do-class",
							service: "do-s",
							environment: "do-e",
						},
					},
					d1_databases: {
						D1_PREVIEW: {
							id: "d1-id",
						},
						D1_PREVIEW2: {
							id: "d1-id",
						},
					},
					r2_buckets: {
						R2_PREVIEW: {
							name: "r2-name",
						},
						R2_PREVIEW2: {
							name: "r2-name",
						},
					},
					services: {
						SERVICE_PREVIEW: {
							service: "service",
							environment: "production",
						},
						SERVICE_PREVIEW2: {
							service: "service",
							environment: "production",
						},
					},
					queue_producers: {
						QUEUE_PREVIEW: {
							name: "q-id",
						},
						QUEUE_PREVIEW2: {
							name: "q-id",
						},
					},
					analytics_engine_datasets: {
						AE_PREVIEW: {
							dataset: "data",
						},
						AE_PREVIEW2: {
							dataset: "data",
						},
					},
					ai_bindings: {
						AI_PREVIEW: {},
					},
					fail_open: true,
					always_use_latest_compatibility_date: true,
					compatibility_date: "2023-02-14",
					build_image_major_version: 2,
					usage_model: "standard",
					limits: {
						cpu_ms: 500,
					},
					placement: { mode: "smart" },
					...previewOverride,
				},
				production: {
					env_vars: {
						TEST_JSON: {
							type: "plain_text",
							value: '{\njson: "value"\n}',
						},
						TEST_PLAINTEXT: {
							type: "plain_text",
							value: "PLAINTEXT",
						},
						TEST_SECRET: {
							type: "secret_text",
							value: "",
						},
						TEST_SECRET_2: {
							type: "secret_text",
							value: "",
						},
					},
					kv_namespaces: {
						KV: {
							namespace_id: "kv-id",
						},
					},
					durable_object_namespaces: {
						DO: {
							namespace_id: "do-id",
						},
					},
					d1_databases: {
						D1: {
							id: "d1-id",
						},
					},
					r2_buckets: {
						R2: {
							name: "r2-name",
						},
					},
					services: {
						SERVICE: {
							service: "service",
							environment: "production",
						},
					},
					queue_producers: {
						QUEUE: {
							name: "q-id",
						},
					},
					analytics_engine_datasets: {
						AE: {
							dataset: "data",
						},
					},
					ai_bindings: {
						AI: {},
					},
					fail_open: true,
					always_use_latest_compatibility_date: false,
					compatibility_date: "2024-02-14",
					build_image_major_version: 2,
					usage_model: "standard",
					limits: {
						cpu_ms: 50,
					},
					...productionOverride,
				},
			},
		},
	};
}

function mockSupportingDashRequests(expectedAccountId: string) {
	msw.use(
		http.get(
			`*/accounts/:accountId/pages/projects/NOT_REAL`,
			({ params }) => {
				expect(params.accountId).toEqual(expectedAccountId);

				return HttpResponse.json(
					{
						success: false,
						errors: [
							{
								code: 8000007,
								message:
									"Project not found. The specified project name does not match any of your existing projects.",
							},
						],
						result: null,
					},
					{ status: 404 }
				);
			},
			{ once: true }
		),

		http.get(
			`*/accounts/:accountId/pages/projects/INHERIT`,
			({ params }) => {
				expect(params.accountId).toEqual(expectedAccountId);

				return HttpResponse.json(
					makePagesProject(
						{
							compatibility_flags: ["some-flag"],
							placement: undefined,
							compatibility_date: "2023-02-14",
							always_use_latest_compatibility_date: false,
							limits: {
								cpu_ms: 500,
							},
						},
						{
							compatibility_flags: ["some-flag"],
							placement: undefined,
							compatibility_date: "2023-02-14",
							limits: {
								cpu_ms: 500,
							},
						}
					),
					{ status: 200 }
				);
			},
			{ once: true }
		),
		http.get(
			`*/accounts/:accountId/pages/projects/NO_PROD_LIMITS`,
			({ params }) => {
				expect(params.accountId).toEqual(expectedAccountId);

				return HttpResponse.json(
					makePagesProject({ limits: { cpu_ms: 500 } }, { limits: undefined }),
					{ status: 200 }
				);
			},
			{ once: true }
		),
		http.get(
			`*/accounts/:accountId/pages/projects/:projectName`,
			({ params }) => {
				expect(params.accountId).toEqual(expectedAccountId);

				return HttpResponse.json(makePagesProject(), { status: 200 });
			},
			{ once: true }
		),
		http.get(
			`*/accounts/:accountId/workers/durable_objects/namespaces/:doId`,
			({ params }) => {
				expect(params.accountId).toEqual(expectedAccountId);

				return HttpResponse.json(
					{
						success: true,
						errors: [],
						result: {
							script: `some-script-${params.doId}`,
							class: `some-class-${params.doId}`,
							environment: `some-environment-${params.doId}`,
						},
					},
					{ status: 200 }
				);
			}
		)
	);
}
describe("pages download config", () => {
	const std = mockConsoleMethods();
	runInTempDir();

	mockApiToken();
	const { setIsTTY } = useMockIsTTY();

	const MOCK_ACCOUNT_ID = "MOCK_ACCOUNT_ID";
	const MOCK_PROJECT_NAME = "MOCK_PROJECT_NAME";
	mockAccountId({ accountId: MOCK_ACCOUNT_ID });

	beforeEach(() => {
		mockSupportingDashRequests(MOCK_ACCOUNT_ID);
		setIsTTY(true);
	});
	afterAll(() => {
		clearDialogs();
	});

	it("should download full config correctly", async () => {
		await runWrangler(`pages download config ${MOCK_PROJECT_NAME}`);

		await expect(await readNormalizedWranglerToml()).toMatchInlineSnapshot(`
			"name = "some-project"
			pages_build_output_dir = "dist-test"
			compatibility_date = "LATEST-SUPPORTED"

			[placement]
			mode = "smart"

			[limits]
			cpu_ms = 500

			[vars]
			TEST_JSON_PREVIEW = "{\\njson: \\"value\\"\\n}"
			TEST_PLAINTEXT_PREVIEW = "PLAINTEXT"

			[[kv_namespaces]]
			id = "kv-id"
			binding = "KV_PREVIEW"

			[[kv_namespaces]]
			id = "kv-id"
			binding = "KV_PREVIEW2"

			[[durable_objects.bindings]]
			name = "DO_PREVIEW"
			class_name = "some-class-do-id"
			script_name = "some-script-do-id"
			environment = "some-environment-do-id"

			[[durable_objects.bindings]]
			name = "DO_PREVIEW2"
			class_name = "some-class-do-id"
			script_name = "some-script-do-id"
			environment = "some-environment-do-id"

			[[durable_objects.bindings]]
			name = "DO_PREVIEW3"
			class_name = "do-class"
			script_name = "do-s"
			environment = "do-e"

			[[d1_databases]]
			database_id = "d1-id"
			binding = "D1_PREVIEW"
			database_name = "D1_PREVIEW"

			[[d1_databases]]
			database_id = "d1-id"
			binding = "D1_PREVIEW2"
			database_name = "D1_PREVIEW2"

			[[r2_buckets]]
			bucket_name = "r2-name"
			binding = "R2_PREVIEW"

			[[r2_buckets]]
			bucket_name = "r2-name"
			binding = "R2_PREVIEW2"

			[[services]]
			binding = "SERVICE_PREVIEW"
			service = "service"
			environment = "production"

			[[services]]
			binding = "SERVICE_PREVIEW2"
			service = "service"
			environment = "production"

			[[queues.producers]]
			binding = "QUEUE_PREVIEW"
			queue = "q-id"

			[[queues.producers]]
			binding = "QUEUE_PREVIEW2"
			queue = "q-id"

			[[analytics_engine_datasets]]
			binding = "AE_PREVIEW"
			dataset = "data"

			[[analytics_engine_datasets]]
			binding = "AE_PREVIEW2"
			dataset = "data"

			[ai]
			binding = "AI_PREVIEW"

			[env.production]
			compatibility_date = "2024-02-14"

			[env.production.placement]
			mode = "off"

			[env.production.limits]
			cpu_ms = 50

			[env.production.vars]
			TEST_JSON = "{\\njson: \\"value\\"\\n}"
			TEST_PLAINTEXT = "PLAINTEXT"

			[[env.production.kv_namespaces]]
			id = "kv-id"
			binding = "KV"

			[[env.production.durable_objects.bindings]]
			name = "DO"
			class_name = "some-class-do-id"
			script_name = "some-script-do-id"
			environment = "some-environment-do-id"

			[[env.production.d1_databases]]
			database_id = "d1-id"
			binding = "D1"
			database_name = "D1"

			[[env.production.r2_buckets]]
			bucket_name = "r2-name"
			binding = "R2"

			[[env.production.services]]
			binding = "SERVICE"
			service = "service"
			environment = "production"

			[[env.production.queues.producers]]
			binding = "QUEUE"
			queue = "q-id"

			[[env.production.analytics_engine_datasets]]
			binding = "AE"
			dataset = "data"

			[env.production.ai]
			binding = "AI"
			"
		`);
	});
	it("should generate preview override if preview has limits and production does not", async () => {
		await runWrangler(`pages download config NO_PROD_LIMITS`);

		await expect(await readNormalizedWranglerToml()).toMatchInlineSnapshot(`
			"name = "some-project"
			pages_build_output_dir = "dist-test"
			compatibility_date = "LATEST-SUPPORTED"

			[placement]
			mode = "smart"

			[vars]
			TEST_JSON_PREVIEW = "{\\njson: \\"value\\"\\n}"
			TEST_PLAINTEXT_PREVIEW = "PLAINTEXT"

			[[kv_namespaces]]
			id = "kv-id"
			binding = "KV_PREVIEW"

			[[kv_namespaces]]
			id = "kv-id"
			binding = "KV_PREVIEW2"

			[[durable_objects.bindings]]
			name = "DO_PREVIEW"
			class_name = "some-class-do-id"
			script_name = "some-script-do-id"
			environment = "some-environment-do-id"

			[[durable_objects.bindings]]
			name = "DO_PREVIEW2"
			class_name = "some-class-do-id"
			script_name = "some-script-do-id"
			environment = "some-environment-do-id"

			[[durable_objects.bindings]]
			name = "DO_PREVIEW3"
			class_name = "do-class"
			script_name = "do-s"
			environment = "do-e"

			[[d1_databases]]
			database_id = "d1-id"
			binding = "D1_PREVIEW"
			database_name = "D1_PREVIEW"

			[[d1_databases]]
			database_id = "d1-id"
			binding = "D1_PREVIEW2"
			database_name = "D1_PREVIEW2"

			[[r2_buckets]]
			bucket_name = "r2-name"
			binding = "R2_PREVIEW"

			[[r2_buckets]]
			bucket_name = "r2-name"
			binding = "R2_PREVIEW2"

			[[services]]
			binding = "SERVICE_PREVIEW"
			service = "service"
			environment = "production"

			[[services]]
			binding = "SERVICE_PREVIEW2"
			service = "service"
			environment = "production"

			[[queues.producers]]
			binding = "QUEUE_PREVIEW"
			queue = "q-id"

			[[queues.producers]]
			binding = "QUEUE_PREVIEW2"
			queue = "q-id"

			[[analytics_engine_datasets]]
			binding = "AE_PREVIEW"
			dataset = "data"

			[[analytics_engine_datasets]]
			binding = "AE_PREVIEW2"
			dataset = "data"

			[ai]
			binding = "AI_PREVIEW"

			[env.preview.placement]
			mode = "smart"

			[env.preview.limits]
			cpu_ms = 500

			[env.preview.vars]
			TEST_JSON_PREVIEW = "{\\njson: \\"value\\"\\n}"
			TEST_PLAINTEXT_PREVIEW = "PLAINTEXT"

			[[env.preview.kv_namespaces]]
			id = "kv-id"
			binding = "KV_PREVIEW"

			[[env.preview.kv_namespaces]]
			id = "kv-id"
			binding = "KV_PREVIEW2"

			[[env.preview.durable_objects.bindings]]
			name = "DO_PREVIEW"
			class_name = "some-class-do-id"
			script_name = "some-script-do-id"
			environment = "some-environment-do-id"

			[[env.preview.durable_objects.bindings]]
			name = "DO_PREVIEW2"
			class_name = "some-class-do-id"
			script_name = "some-script-do-id"
			environment = "some-environment-do-id"

			[[env.preview.durable_objects.bindings]]
			name = "DO_PREVIEW3"
			class_name = "do-class"
			script_name = "do-s"
			environment = "do-e"

			[[env.preview.d1_databases]]
			database_id = "d1-id"
			binding = "D1_PREVIEW"
			database_name = "D1_PREVIEW"

			[[env.preview.d1_databases]]
			database_id = "d1-id"
			binding = "D1_PREVIEW2"
			database_name = "D1_PREVIEW2"

			[[env.preview.r2_buckets]]
			bucket_name = "r2-name"
			binding = "R2_PREVIEW"

			[[env.preview.r2_buckets]]
			bucket_name = "r2-name"
			binding = "R2_PREVIEW2"

			[[env.preview.services]]
			binding = "SERVICE_PREVIEW"
			service = "service"
			environment = "production"

			[[env.preview.services]]
			binding = "SERVICE_PREVIEW2"
			service = "service"
			environment = "production"

			[[env.preview.queues.producers]]
			binding = "QUEUE_PREVIEW"
			queue = "q-id"

			[[env.preview.queues.producers]]
			binding = "QUEUE_PREVIEW2"
			queue = "q-id"

			[[env.preview.analytics_engine_datasets]]
			binding = "AE_PREVIEW"
			dataset = "data"

			[[env.preview.analytics_engine_datasets]]
			binding = "AE_PREVIEW2"
			dataset = "data"

			[env.preview.ai]
			binding = "AI_PREVIEW"

			[env.production]
			compatibility_date = "2024-02-14"

			[env.production.placement]
			mode = "off"

			[env.production.vars]
			TEST_JSON = "{\\njson: \\"value\\"\\n}"
			TEST_PLAINTEXT = "PLAINTEXT"

			[[env.production.kv_namespaces]]
			id = "kv-id"
			binding = "KV"

			[[env.production.durable_objects.bindings]]
			name = "DO"
			class_name = "some-class-do-id"
			script_name = "some-script-do-id"
			environment = "some-environment-do-id"

			[[env.production.d1_databases]]
			database_id = "d1-id"
			binding = "D1"
			database_name = "D1"

			[[env.production.r2_buckets]]
			bucket_name = "r2-name"
			binding = "R2"

			[[env.production.services]]
			binding = "SERVICE"
			service = "service"
			environment = "production"

			[[env.production.queues.producers]]
			binding = "QUEUE"
			queue = "q-id"

			[[env.production.analytics_engine_datasets]]
			binding = "AE"
			dataset = "data"

			[env.production.ai]
			binding = "AI"
			"
		`);
	});
	it("should not duplicate inheritable properties if they're equal", async () => {
		await runWrangler(`pages download config INHERIT`);

		await expect(await readNormalizedWranglerToml()).toMatchInlineSnapshot(`
			"name = "some-project"
			pages_build_output_dir = "dist-test"
			compatibility_date = "2023-02-14"
			compatibility_flags = [ "some-flag" ]

			[limits]
			cpu_ms = 500

			[vars]
			TEST_JSON_PREVIEW = "{\\njson: \\"value\\"\\n}"
			TEST_PLAINTEXT_PREVIEW = "PLAINTEXT"

			[[kv_namespaces]]
			id = "kv-id"
			binding = "KV_PREVIEW"

			[[kv_namespaces]]
			id = "kv-id"
			binding = "KV_PREVIEW2"

			[[durable_objects.bindings]]
			name = "DO_PREVIEW"
			class_name = "some-class-do-id"
			script_name = "some-script-do-id"
			environment = "some-environment-do-id"

			[[durable_objects.bindings]]
			name = "DO_PREVIEW2"
			class_name = "some-class-do-id"
			script_name = "some-script-do-id"
			environment = "some-environment-do-id"

			[[durable_objects.bindings]]
			name = "DO_PREVIEW3"
			class_name = "do-class"
			script_name = "do-s"
			environment = "do-e"

			[[d1_databases]]
			database_id = "d1-id"
			binding = "D1_PREVIEW"
			database_name = "D1_PREVIEW"

			[[d1_databases]]
			database_id = "d1-id"
			binding = "D1_PREVIEW2"
			database_name = "D1_PREVIEW2"

			[[r2_buckets]]
			bucket_name = "r2-name"
			binding = "R2_PREVIEW"

			[[r2_buckets]]
			bucket_name = "r2-name"
			binding = "R2_PREVIEW2"

			[[services]]
			binding = "SERVICE_PREVIEW"
			service = "service"
			environment = "production"

			[[services]]
			binding = "SERVICE_PREVIEW2"
			service = "service"
			environment = "production"

			[[queues.producers]]
			binding = "QUEUE_PREVIEW"
			queue = "q-id"

			[[queues.producers]]
			binding = "QUEUE_PREVIEW2"
			queue = "q-id"

			[[analytics_engine_datasets]]
			binding = "AE_PREVIEW"
			dataset = "data"

			[[analytics_engine_datasets]]
			binding = "AE_PREVIEW2"
			dataset = "data"

			[ai]
			binding = "AI_PREVIEW"

			[env.production.vars]
			TEST_JSON = "{\\njson: \\"value\\"\\n}"
			TEST_PLAINTEXT = "PLAINTEXT"

			[[env.production.kv_namespaces]]
			id = "kv-id"
			binding = "KV"

			[[env.production.durable_objects.bindings]]
			name = "DO"
			class_name = "some-class-do-id"
			script_name = "some-script-do-id"
			environment = "some-environment-do-id"

			[[env.production.d1_databases]]
			database_id = "d1-id"
			binding = "D1"
			database_name = "D1"

			[[env.production.r2_buckets]]
			bucket_name = "r2-name"
			binding = "R2"

			[[env.production.services]]
			binding = "SERVICE"
			service = "service"
			environment = "production"

			[[env.production.queues.producers]]
			binding = "QUEUE"
			queue = "q-id"

			[[env.production.analytics_engine_datasets]]
			binding = "AE"
			dataset = "data"

			[env.production.ai]
			binding = "AI"
			"
		`);
	});
	it("should fail if not given a project name", async () => {
		await expect(
			runWrangler(`pages download config`)
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: Must specify a project name.]`
		);
	});
	it("should fail if project does not exist", async () => {
		await expect(
			runWrangler(`pages download config NOT_REAL`)
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[APIError: A request to the Cloudflare API (/accounts/MOCK_ACCOUNT_ID/pages/projects/NOT_REAL) failed.]`
		);
		expect(std).toMatchInlineSnapshot(`
			{
			  "debug": "",
			  "err": "[31mX [41;31m[[41;97mERROR[41;31m][0m [1mA request to the Cloudflare API (/accounts/MOCK_ACCOUNT_ID/pages/projects/NOT_REAL) failed.[0m

			  Project not found. The specified project name does not match any of your existing projects. [code:
			  8000007]

			  If you think this is a bug, please open an issue at:
			  [4mhttps://github.com/cloudflare/workers-sdk/issues/new/choose[0m

			",
			  "info": "",
			  "out": "
			 ⛅️ wrangler x.x.x
			──────────────────
			",
			  "warn": "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1m🚧 \`wrangler pages download config\` is an experimental command. Please report any issues to https://github.com/cloudflare/workers-sdk/issues/new/choose[0m

			",
			}
		`);
	});
	describe("overwrite existing file", () => {
		it("should overwrite existing file w/ --force", async () => {
			await writeWranglerConfig({ name: "some-project" });
			await runWrangler(`pages download config ${MOCK_PROJECT_NAME} --force`);

			await expect(await readNormalizedWranglerToml()).toMatchInlineSnapshot(`
				"name = "some-project"
				pages_build_output_dir = "dist-test"
				compatibility_date = "LATEST-SUPPORTED"

				[placement]
				mode = "smart"

				[limits]
				cpu_ms = 500

				[vars]
				TEST_JSON_PREVIEW = "{\\njson: \\"value\\"\\n}"
				TEST_PLAINTEXT_PREVIEW = "PLAINTEXT"

				[[kv_namespaces]]
				id = "kv-id"
				binding = "KV_PREVIEW"

				[[kv_namespaces]]
				id = "kv-id"
				binding = "KV_PREVIEW2"

				[[durable_objects.bindings]]
				name = "DO_PREVIEW"
				class_name = "some-class-do-id"
				script_name = "some-script-do-id"
				environment = "some-environment-do-id"

				[[durable_objects.bindings]]
				name = "DO_PREVIEW2"
				class_name = "some-class-do-id"
				script_name = "some-script-do-id"
				environment = "some-environment-do-id"

				[[durable_objects.bindings]]
				name = "DO_PREVIEW3"
				class_name = "do-class"
				script_name = "do-s"
				environment = "do-e"

				[[d1_databases]]
				database_id = "d1-id"
				binding = "D1_PREVIEW"
				database_name = "D1_PREVIEW"

				[[d1_databases]]
				database_id = "d1-id"
				binding = "D1_PREVIEW2"
				database_name = "D1_PREVIEW2"

				[[r2_buckets]]
				bucket_name = "r2-name"
				binding = "R2_PREVIEW"

				[[r2_buckets]]
				bucket_name = "r2-name"
				binding = "R2_PREVIEW2"

				[[services]]
				binding = "SERVICE_PREVIEW"
				service = "service"
				environment = "production"

				[[services]]
				binding = "SERVICE_PREVIEW2"
				service = "service"
				environment = "production"

				[[queues.producers]]
				binding = "QUEUE_PREVIEW"
				queue = "q-id"

				[[queues.producers]]
				binding = "QUEUE_PREVIEW2"
				queue = "q-id"

				[[analytics_engine_datasets]]
				binding = "AE_PREVIEW"
				dataset = "data"

				[[analytics_engine_datasets]]
				binding = "AE_PREVIEW2"
				dataset = "data"

				[ai]
				binding = "AI_PREVIEW"

				[env.production]
				compatibility_date = "2024-02-14"

				[env.production.placement]
				mode = "off"

				[env.production.limits]
				cpu_ms = 50

				[env.production.vars]
				TEST_JSON = "{\\njson: \\"value\\"\\n}"
				TEST_PLAINTEXT = "PLAINTEXT"

				[[env.production.kv_namespaces]]
				id = "kv-id"
				binding = "KV"

				[[env.production.durable_objects.bindings]]
				name = "DO"
				class_name = "some-class-do-id"
				script_name = "some-script-do-id"
				environment = "some-environment-do-id"

				[[env.production.d1_databases]]
				database_id = "d1-id"
				binding = "D1"
				database_name = "D1"

				[[env.production.r2_buckets]]
				bucket_name = "r2-name"
				binding = "R2"

				[[env.production.services]]
				binding = "SERVICE"
				service = "service"
				environment = "production"

				[[env.production.queues.producers]]
				binding = "QUEUE"
				queue = "q-id"

				[[env.production.analytics_engine_datasets]]
				binding = "AE"
				dataset = "data"

				[env.production.ai]
				binding = "AI"
				"
			`);
		});
		it("should not overwrite existing file w/o --force (non-interactive)", async () => {
			setIsTTY(false);
			await writeWranglerConfig({ name: "some-project" });
			await expect(
				runWrangler(`pages download config ${MOCK_PROJECT_NAME}`)
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: Not overwriting existing Wrangler configuration file]`
			);

			await expect(await readNormalizedWranglerToml()).toMatchInlineSnapshot(
				`
				"name = "some-project"
				"
			`
			);
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				? Your existing Wrangler configuration file will be overwritten. Continue?
				🤖 Using fallback value in non-interactive context: no
				"
			`);
		});
		it("should overwrite existing file w/ prompt", async () => {
			await writeWranglerConfig({ name: "some-project" });
			await mockConfirm({
				text: "Your existing Wrangler configuration file will be overwritten. Continue?",
				result: true,
			});
			await runWrangler(`pages download config ${MOCK_PROJECT_NAME}`);

			await expect(await readNormalizedWranglerToml()).toMatchInlineSnapshot(`
				"name = "some-project"
				pages_build_output_dir = "dist-test"
				compatibility_date = "LATEST-SUPPORTED"

				[placement]
				mode = "smart"

				[limits]
				cpu_ms = 500

				[vars]
				TEST_JSON_PREVIEW = "{\\njson: \\"value\\"\\n}"
				TEST_PLAINTEXT_PREVIEW = "PLAINTEXT"

				[[kv_namespaces]]
				id = "kv-id"
				binding = "KV_PREVIEW"

				[[kv_namespaces]]
				id = "kv-id"
				binding = "KV_PREVIEW2"

				[[durable_objects.bindings]]
				name = "DO_PREVIEW"
				class_name = "some-class-do-id"
				script_name = "some-script-do-id"
				environment = "some-environment-do-id"

				[[durable_objects.bindings]]
				name = "DO_PREVIEW2"
				class_name = "some-class-do-id"
				script_name = "some-script-do-id"
				environment = "some-environment-do-id"

				[[durable_objects.bindings]]
				name = "DO_PREVIEW3"
				class_name = "do-class"
				script_name = "do-s"
				environment = "do-e"

				[[d1_databases]]
				database_id = "d1-id"
				binding = "D1_PREVIEW"
				database_name = "D1_PREVIEW"

				[[d1_databases]]
				database_id = "d1-id"
				binding = "D1_PREVIEW2"
				database_name = "D1_PREVIEW2"

				[[r2_buckets]]
				bucket_name = "r2-name"
				binding = "R2_PREVIEW"

				[[r2_buckets]]
				bucket_name = "r2-name"
				binding = "R2_PREVIEW2"

				[[services]]
				binding = "SERVICE_PREVIEW"
				service = "service"
				environment = "production"

				[[services]]
				binding = "SERVICE_PREVIEW2"
				service = "service"
				environment = "production"

				[[queues.producers]]
				binding = "QUEUE_PREVIEW"
				queue = "q-id"

				[[queues.producers]]
				binding = "QUEUE_PREVIEW2"
				queue = "q-id"

				[[analytics_engine_datasets]]
				binding = "AE_PREVIEW"
				dataset = "data"

				[[analytics_engine_datasets]]
				binding = "AE_PREVIEW2"
				dataset = "data"

				[ai]
				binding = "AI_PREVIEW"

				[env.production]
				compatibility_date = "2024-02-14"

				[env.production.placement]
				mode = "off"

				[env.production.limits]
				cpu_ms = 50

				[env.production.vars]
				TEST_JSON = "{\\njson: \\"value\\"\\n}"
				TEST_PLAINTEXT = "PLAINTEXT"

				[[env.production.kv_namespaces]]
				id = "kv-id"
				binding = "KV"

				[[env.production.durable_objects.bindings]]
				name = "DO"
				class_name = "some-class-do-id"
				script_name = "some-script-do-id"
				environment = "some-environment-do-id"

				[[env.production.d1_databases]]
				database_id = "d1-id"
				binding = "D1"
				database_name = "D1"

				[[env.production.r2_buckets]]
				bucket_name = "r2-name"
				binding = "R2"

				[[env.production.services]]
				binding = "SERVICE"
				service = "service"
				environment = "production"

				[[env.production.queues.producers]]
				binding = "QUEUE"
				queue = "q-id"

				[[env.production.analytics_engine_datasets]]
				binding = "AE"
				dataset = "data"

				[env.production.ai]
				binding = "AI"
				"
			`);
		});
		it("should not overwrite existing file w/ prompt", async () => {
			await writeWranglerConfig({ name: "some-project" });
			await mockConfirm({
				text: "Your existing `wrangler.toml` file will be overwritten. Continue?",
				result: false,
			});
			await expect(
				runWrangler(`pages download config ${MOCK_PROJECT_NAME}`)
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[AssertionError: expected { Object (type, name, ...) } to strictly equal { Object (type, name, ...) }]`
			);

			await expect(await readNormalizedWranglerToml()).toMatchInlineSnapshot(
				`
				"name = "some-project"
				"
			`
			);
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────

				[32mIf you think this is a bug then please create an issue at https://github.com/cloudflare/workers-sdk/issues/new/choose[0m"
			`);
		});
	});
});
