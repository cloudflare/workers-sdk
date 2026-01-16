import * as fs from "node:fs";
import path from "node:path";
import { execa } from "execa";
import { http, HttpResponse } from "msw";
import * as TOML from "smol-toml";
import dedent from "ts-dedent";
import { parseConfigFileTextToJson } from "typescript";
import { FormData } from "undici";
import { afterEach, beforeEach, describe, expect, it, test, vi } from "vitest";
import { downloadWorker } from "../init";
import { writeMetricsConfig } from "../metrics/metrics-config";
import { getPackageManager } from "../package-manager";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { clearDialogs } from "./helpers/mock-dialogs";
import { useMockIsTTY } from "./helpers/mock-istty";
import { msw } from "./helpers/msw";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import type { PackageManager } from "../package-manager";
import type { RawConfig, UserLimits } from "@cloudflare/workers-utils";
import type { Mock } from "vitest";

describe("init", () => {
	let mockPackageManager: PackageManager;
	runInTempDir();
	const { setIsTTY } = useMockIsTTY();

	beforeEach(() => {
		setIsTTY(true);

		mockPackageManager = {
			cwd: process.cwd(),
			// @ts-expect-error we're making a fake package manager here
			type: "mockpm",
			addDevDeps: vi.fn(),
			install: vi.fn(),
		};
		(getPackageManager as Mock).mockResolvedValue(mockPackageManager);
	});

	afterEach(() => {
		clearDialogs();
	});

	const std = mockConsoleMethods();

	describe("`wrangler init` now delegates to c3 by default", () => {
		test("shows that it delegates to C3", async () => {
			await runWrangler("init");

			checkFiles({
				items: {
					"./src/index.js": false,
					"./src/index.ts": false,
					"./tsconfig.json": false,
					"./package.json": false,
					"./wrangler.jsonc": false,
				},
			});

			expect(std).toMatchInlineSnapshot(`
				Object {
				  "debug": "",
				  "err": "",
				  "info": "",
				  "out": "
				 ⛅️ wrangler x.x.x
				──────────────────
				🌀 Running \`mockpm create cloudflare@^2.5.0\`...",
				  "warn": "",
				}
			`);

			expect(execa).toHaveBeenCalledWith(
				"mockpm",
				["create", "cloudflare@^2.5.0"],
				{
					stdio: ["inherit", "pipe", "pipe"],
				}
			);
		});

		it("if `-y` is used, delegate to c3 with --wrangler-defaults", async () => {
			await runWrangler("init -y");

			expect(execa).toHaveBeenCalledWith(
				"mockpm",
				["create", "cloudflare@^2.5.0", "--wrangler-defaults"],
				{
					stdio: ["inherit", "pipe", "pipe"],
				}
			);
		});

		describe("with custom C3 command", () => {
			beforeEach(() => {
				vi.stubEnv("WRANGLER_C3_COMMAND", "run create-cloudflare");
			});

			test("shows that it delegates to C3", async () => {
				await runWrangler("init");

				checkFiles({
					items: {
						"./src/index.js": false,
						"./src/index.ts": false,
						"./tsconfig.json": false,
						"./package.json": false,
						"./wrangler.jsonc": false,
					},
				});

				expect(std).toMatchInlineSnapshot(`
					Object {
					  "debug": "",
					  "err": "",
					  "info": "",
					  "out": "
					 ⛅️ wrangler x.x.x
					──────────────────
					🌀 Running \`mockpm run create-cloudflare\`...",
					  "warn": "",
					}
				`);

				expect(execa).toHaveBeenCalledWith(
					"mockpm",
					["run", "create-cloudflare"],
					{
						stdio: ["inherit", "pipe", "pipe"],
					}
				);
			});

			it("if `-y` is used, delegate to c3 with --wrangler-defaults", async () => {
				await runWrangler("init -y");

				expect(execa).toHaveBeenCalledWith(
					"mockpm",
					["run", "create-cloudflare", "--wrangler-defaults"],
					{
						stdio: ["inherit", "pipe", "pipe"],
					}
				);
			});
		});

		test("if telemetry is disabled in wrangler, then disable for c3 too", async () => {
			writeMetricsConfig({
				permission: {
					enabled: false,
					date: new Date(2024, 11, 11),
				},
			});
			await runWrangler("init");

			expect(execa).toHaveBeenCalledWith(
				"mockpm",
				["create", "cloudflare@^2.5.0"],
				{
					env: {
						CREATE_CLOUDFLARE_TELEMETRY_DISABLED: "1",
					},
					stdio: ["inherit", "pipe", "pipe"],
				}
			);
		});
	});

	describe("--from-dash --no-delegate-c3", () => {
		function makeWorker({
			main = "src/index.js",
			id = "isolinear-optical-chip",
			usage_model = "bundled",
			tags = [],
			compatibility_date = "1987-09-27",
			content = dedent/*javascript*/ `
							export default {
								async fetch(request, env, ctx) {
									return new Response("Hello World!");
								},
							};
						`,
			schedules = [
				{
					cron: "0 0 0 * * *",
					created_on: new Date(1987, 9, 27),
					modified_on: new Date(1987, 9, 27),
				},
			],
			bindings = [
				{
					type: "secret_text",
					name: "ABC",
				},
				{
					type: "plain_text",
					name: "ANOTHER-NAME",
					text: "thing-TEXT",
				},
				{
					type: "durable_object_namespace",
					name: "DURABLE_TEST",
					class_name: "Durability",
					script_name: "another-durable-object-worker",
					environment: "production",
				},
				{
					type: "durable_object_namespace",
					name: "DURABLE_TEST_SAME_WORKER",
					class_name: "DurabilitySameWorker",
					script_name: "isolinear-optical-chip",
				},
				{
					type: "kv_namespace",
					name: "kv_testing",
					namespace_id: "some-namespace-id",
				},
				{
					type: "r2_bucket",
					bucket_name: "test-bucket",
					name: "test-bucket",
				},
				{
					environment: "production",
					name: "website",
					service: "website",
					type: "service",
					entrypoint: "WWWHandler",
				},
				{
					type: "dispatch_namespace",
					name: "name-namespace-mock",
					namespace: "namespace-mock",
				},
				{
					name: "httplogs",
					type: "logfwdr",
					destination: "httplogs",
				},
				{
					name: "trace",
					type: "logfwdr",
					destination: "trace",
				},
				{
					type: "wasm_module",
					name: "WASM_MODULE_ONE",
					part: "./some_wasm.wasm",
				},
				{
					type: "wasm_module",
					name: "WASM_MODULE_TWO",
					part: "./more_wasm.wasm",
				},
				{
					type: "text_blob",
					name: "TEXT_BLOB_ONE",
					part: "./my-entire-app-depends-on-this.cfg",
				},
				{
					type: "d1",
					name: "DB",
					id: "40160e84-9fdb-4ce7-8578-23893cecc5a3",
				},
				{
					type: "text_blob",
					name: "TEXT_BLOB_TWO",
					part: "./the-entirety-of-human-knowledge.txt",
				},
				{ type: "data_blob", name: "DATA_BLOB_ONE", part: "DATA_BLOB_ONE" },
				{ type: "data_blob", name: "DATA_BLOB_TWO", part: "DATA_BLOB_TWO" },
				{
					type: "some unsafe thing",
					name: "UNSAFE_BINDING_ONE",
					data: { some: { unsafe: "thing" } },
				},
				{
					type: "another unsafe thing",
					name: "UNSAFE_BINDING_TWO",
					data: 1337,
				},
				{
					type: "inherit",
					name: "INHERIT_BINDING",
				},
				{
					type: "pipelines",
					name: "PIPELINE_BINDING",
					pipeline: "some-name",
				},
				{
					type: "mtls_certificate",
					name: "MTLS_BINDING",
					certificate_id: "some-id",
				},
				{
					type: "hyperdrive",
					name: "HYPER_BINDING",
					id: "some-id",
				},
				{
					type: "vectorize",
					name: "VECTOR_BINDING",
					index_name: "some-name",
				},
				{
					type: "queue",
					name: "queue_BINDING",
					queue_name: "some-name",
					delivery_delay: 1,
				},
				{
					type: "send_email",
					name: "EMAIL_BINDING",
					destination_address: "some@address.com",
					allowed_destination_addresses: ["some2@address.com"],
					allowed_sender_addresses: ["some2@address.com"],
				},
				{
					type: "version_metadata",
					name: "Version_BINDING",
				},
			],
			routes = [
				{
					id: "some-route-id",
					pattern: "delta.quadrant",
					zone_name: "delta.quadrant",
				},
			],
			customDomains = [],
			workersDev = true,
			limits,
		}: {
			main?: string;
			id?: string;
			tags?: string[];
			usage_model?: string;
			compatibility_date?: string | null;
			content?: string | FormData;
			schedules?: { cron: string; created_on: Date; modified_on: Date }[];
			bindings?: unknown[];
			routes?: unknown[];
			customDomains?: unknown[];
			workersDev?: boolean;
			limits?: UserLimits;
		} = {}) {
			return {
				main,
				schedules,
				service: {
					id,
					default_environment: {
						environment: "test",
						created_on: "1987-09-27",
						modified_on: "1987-09-27",
						script: {
							id,
							tag: "test-tag",
							tags,
							etag: "some-etag",
							handlers: [],
							modified_on: "1987-09-27",
							created_on: "1987-09-27",
							migration_tag: "some-migration-tag",
							usage_model,
							limits,
							compatibility_date,
							tail_consumers: [{ service: "listener" }],
							observability: { enabled: true, head_sampling_rate: 0.5 },
						},
					},
					created_on: "1987-09-27",
					modified_on: "1987-09-27",
					environments: [
						{
							environment: "test",
							created_on: "1987-09-27",
							modified_on: "1987-09-27",
						},
						{
							environment: "staging",
							created_on: "1987-09-27",
							modified_on: "1987-09-27",
						},
					],
				},
				usage_model,
				content,
				bindings,
				routes,
				customDomains,
				workersDev,
			} as const;
		}
		mockApiToken();
		const MOCK_ACCOUNT_ID = "LCARS";
		mockAccountId({ accountId: MOCK_ACCOUNT_ID });

		let worker: ReturnType<typeof makeWorker>;

		beforeEach(() => {
			worker = makeWorker();
			mockSupportingDashRequests(MOCK_ACCOUNT_ID);
		});

		const mockConfigExpected: RawConfig = {
			workers_dev: true,
			main: "src/index.js",
			compatibility_date: "1987-09-27",
			name: "isolinear-optical-chip",
			migrations: [
				{
					new_classes: ["DurabilitySameWorker"],
					tag: "some-migration-tag",
				},
			],
			durable_objects: {
				bindings: [
					{
						class_name: "Durability",
						name: "DURABLE_TEST",
						script_name: "another-durable-object-worker",
						environment: "production",
					},
					{
						class_name: "DurabilitySameWorker",
						name: "DURABLE_TEST_SAME_WORKER",
						script_name: "isolinear-optical-chip",
					},
				],
			},
			d1_databases: [
				{
					binding: "DB",
					database_id: "40160e84-9fdb-4ce7-8578-23893cecc5a3",
				},
			],
			kv_namespaces: [
				{
					binding: "kv_testing",
					id: "some-namespace-id",
				},
			],
			r2_buckets: [
				{
					bucket_name: "test-bucket",
					binding: "test-bucket",
				},
			],
			dispatch_namespaces: [
				{
					binding: "name-namespace-mock",
					namespace: "namespace-mock",
				},
			],
			routes: [{ pattern: "delta.quadrant", zone_name: "delta.quadrant" }],
			services: [
				{
					environment: "production",
					binding: "website",
					service: "website",
					entrypoint: "WWWHandler",
				},
			],
			triggers: {
				crons: ["0 0 0 * * *"],
			},
			vars: {
				"ANOTHER-NAME": "thing-TEXT",
			},
			unsafe: {
				bindings: [
					{
						name: "UNSAFE_BINDING_ONE",
						type: "some unsafe thing",
						data: { some: { unsafe: "thing" } },
					},
					{
						name: "UNSAFE_BINDING_TWO",
						type: "another unsafe thing",
						data: 1337,
					},
					{
						name: "INHERIT_BINDING",
						type: "inherit",
					},
				],
			},
			vectorize: [
				{
					binding: "VECTOR_BINDING",
					index_name: "some-name",
				},
			],
			send_email: [
				{
					allowed_sender_addresses: ["some2@address.com"],
					allowed_destination_addresses: ["some2@address.com"],
					destination_address: "some@address.com",
					name: "EMAIL_BINDING",
				},
			],
			version_metadata: {
				binding: "Version_BINDING",
			},
			hyperdrive: [
				{
					binding: "HYPER_BINDING",
					id: "some-id",
				},
			],
			mtls_certificates: [
				{
					binding: "MTLS_BINDING",
					certificate_id: "some-id",
				},
			],
			pipelines: [
				{
					binding: "PIPELINE_BINDING",
					pipeline: "some-name",
				},
			],
			queues: {
				producers: [
					{
						binding: "queue_BINDING",
						delivery_delay: 1,
						queue: "some-name",
					},
				],
			},
			wasm_modules: {
				WASM_MODULE_ONE: "./some_wasm.wasm",
				WASM_MODULE_TWO: "./more_wasm.wasm",
			},
			text_blobs: {
				TEXT_BLOB_ONE: "./my-entire-app-depends-on-this.cfg",
				TEXT_BLOB_TWO: "./the-entirety-of-human-knowledge.txt",
			},
			data_blobs: {
				DATA_BLOB_ONE: "DATA_BLOB_ONE",
				DATA_BLOB_TWO: "DATA_BLOB_TWO",
			},
			logfwdr: {
				bindings: [
					{
						name: "httplogs",
						destination: "httplogs",
					},
					{
						name: "trace",
						destination: "trace",
					},
				],
			},
			tail_consumers: [{ service: "listener" }],
			observability: { enabled: true, head_sampling_rate: 0.5 },
		};

		function mockSupportingDashRequests(expectedAccountId: string) {
			msw.use(
				// This is fetched twice in normal usage
				http.get(
					`*/accounts/:accountId/workers/services/:scriptName`,
					({ params }) => {
						expect(params.accountId).toEqual(expectedAccountId);
						expect(params.scriptName).toEqual(worker.service.id);

						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: worker.service,
							},
							{ status: 200 }
						);
					},
					{ once: true }
				),
				http.get(
					`*/accounts/:accountId/workers/services/:scriptName`,
					({ params }) => {
						expect(params.accountId).toEqual(expectedAccountId);
						expect(params.scriptName).toEqual(worker.service.id);

						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: worker.service,
							},
							{ status: 200 }
						);
					},
					{ once: true }
				),
				http.get(
					`*/accounts/:accountId/workers/services/:scriptName/environments/:environment/bindings`,
					({ params }) => {
						expect(params.accountId).toEqual(expectedAccountId);
						expect(params.scriptName).toEqual(worker.service.id);
						expect(params.environment).toEqual(
							worker.service.default_environment.environment
						);

						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: worker.bindings,
							},
							{ status: 200 }
						);
					}
				),
				http.get(
					`*/accounts/:accountId/workers/services/:scriptName/environments/:environment/routes`,
					({ params }) => {
						expect(params.accountId).toEqual(expectedAccountId);
						expect(params.scriptName).toEqual(worker.service.id);
						expect(params.environment).toEqual(
							worker.service.default_environment.environment
						);

						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: worker.routes,
							},
							{ status: 200 }
						);
					},
					{ once: true }
				),
				http.get(
					`*/accounts/:accountId/workers/domains/records`,
					() => {
						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: worker.customDomains,
							},
							{ status: 200 }
						);
					},
					{ once: true }
				),
				http.get(
					`*/accounts/:accountId/workers/services/:scriptName/environments/:environment/subdomain`,
					({ params }) => {
						expect(params.accountId).toEqual(expectedAccountId);
						expect(params.scriptName).toEqual(worker.service.id);
						expect(params.environment).toEqual(
							worker.service.default_environment.environment
						);

						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: { enabled: worker.workersDev },
							},
							{ status: 200 }
						);
					},
					{ once: true }
				),
				http.get(
					`*/accounts/:accountId/workers/services/:scriptName/environments/:environment`,

					({ params }) => {
						expect(params.accountId).toEqual(expectedAccountId);
						expect(params.scriptName).toEqual(worker.service.id);
						expect(params.environment).toEqual(
							worker.service.default_environment.environment
						);

						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: worker.service.default_environment,
							},
							{ status: 200 }
						);
					},
					{ once: true }
				),
				http.get(
					`*/accounts/:accountId/workers/scripts/:scriptName/schedules`,
					({ params }) => {
						expect(params.accountId).toEqual(expectedAccountId);
						expect(params.scriptName).toEqual(worker.service.id);

						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: {
									schedules: worker.schedules,
								},
							},
							{ status: 200 }
						);
					},
					{ once: true }
				),
				http.get(
					`*/accounts/:accountId/workers/services/:fromDashScriptName/environments/:environment/content/v2`,
					// @ts-expect-error Something's up with the MSW types
					async () => {
						if (typeof worker.content === "string") {
							return HttpResponse.text(worker.content, {
								headers: {
									"cf-entrypoint": worker.main,
								},
							});
						}

						return HttpResponse.formData(worker.content, {
							headers: {
								"cf-entrypoint": worker.main,
							},
						});
					},
					{ once: true }
				),
				http.get(
					`*/accounts/:accountId/workers/standard`,
					() => {
						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: {
									standard:
										worker.service.default_environment.script.usage_model ===
										"standard",
								},
							},
							{ status: 200 }
						);
					},
					{ once: true }
				),
				http.get(
					`*/accounts/:accountId/d1/database/:database_id`,
					() => {
						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: {
									uuid: "40160e84-9fdb-4ce7-8578-23893cecc5a3",
									name: "mydb",
								},
							},
							{ status: 200 }
						);
					},
					{ once: true }
				)
			);
		}

		test("delegates to C3 --type pre-existing", async () => {
			await runWrangler("init --from-dash existing-memory-crystal");

			checkFiles({
				items: {
					"./src/index.js": false,
					"./src/index.ts": false,
					"./tsconfig.json": false,
					"./package.json": false,
					"./wrangler.jsonc": false,
				},
			});

			expect(std).toMatchInlineSnapshot(`
				Object {
				  "debug": "",
				  "err": "",
				  "info": "",
				  "out": "
				 ⛅️ wrangler x.x.x
				──────────────────
				🌀 Running \`mockpm create cloudflare@^2.5.0 existing-memory-crystal --existing-script existing-memory-crystal\`...",
				  "warn": "",
				}
			`);

			expect(execa).toHaveBeenCalledTimes(1);
			expect(execa).toHaveBeenCalledWith(
				"mockpm",
				[
					"create",
					"cloudflare@^2.5.0",
					"existing-memory-crystal",
					"--existing-script",
					"existing-memory-crystal",
				],
				{
					stdio: ["inherit", "pipe", "pipe"],
				}
			);
		});
		it("should download routes + custom domains + workers dev", async () => {
			worker = makeWorker({
				customDomains: [
					{
						id: "some-id",
						zone_id: "some-zone-id",
						zone_name: "some-zone-name",
						hostname: "random.host.name",
						service: "memory-crystal",
						environment: "test",
						cert_id: "some-id",
					},
				],
				workersDev: false,
				bindings: [],
				schedules: [],
			});

			await runWrangler(
				"init --from-dash isolinear-optical-chip --no-delegate-c3"
			);

			expect(fs.readFileSync("./isolinear-optical-chip/wrangler.jsonc", "utf8"))
				.toMatchInlineSnapshot(`
				"{
				  \\"name\\": \\"isolinear-optical-chip\\",
				  \\"main\\": \\"src/index.js\\",
				  \\"workers_dev\\": false,
				  \\"compatibility_date\\": \\"1987-09-27\\",
				  \\"routes\\": [
				    {
				      \\"pattern\\": \\"delta.quadrant\\",
				      \\"zone_name\\": \\"delta.quadrant\\"
				    },
				    {
				      \\"pattern\\": \\"random.host.name\\",
				      \\"zone_name\\": \\"some-zone-name\\",
				      \\"custom_domain\\": true
				    }
				  ],
				  \\"tail_consumers\\": [
				    {
				      \\"service\\": \\"listener\\"
				    }
				  ],
				  \\"observability\\": {
				    \\"enabled\\": true,
				    \\"head_sampling_rate\\": 0.5
				  }
				}"
			`);
		});

		it("should fail on init --from-dash on non-existent worker name", async () => {
			msw.use(
				http.get(
					`*/accounts/:accountId/workers/services/:scriptName`,
					() => {
						return HttpResponse.json(
							{
								success: false,
								errors: [
									{
										code: 10090,
										message: "workers.api.error.service_not_found",
									},
								],
								messages: [],
								result: worker.service,
							},
							{ status: 404 }
						);
					},
					{ once: true }
				)
			);
			await expect(
				runWrangler(
					"init isolinear-optical-chip --from-dash i-dont-exist --no-delegate-c3"
				)
			).rejects.toThrowError();

			expect(std.err).toMatchInlineSnapshot(`
					"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mwrangler couldn't find a Worker with that name in your account.[0m

					  Run \`wrangler whoami\` to confirm you're logged into the correct account.

					"
				`);
		});

		it("should download source script from dashboard w/ out positional <name>", async () => {
			worker = makeWorker({
				id: "isolinear-optical-chip",
			});

			await runWrangler(
				"init --from-dash isolinear-optical-chip --no-delegate-c3"
			);

			expect(fs.readFileSync("./isolinear-optical-chip/wrangler.jsonc", "utf8"))
				.toMatchInlineSnapshot(`
					"{
					  \\"name\\": \\"isolinear-optical-chip\\",
					  \\"main\\": \\"src/index.js\\",
					  \\"workers_dev\\": true,
					  \\"compatibility_date\\": \\"1987-09-27\\",
					  \\"routes\\": [
					    {
					      \\"pattern\\": \\"delta.quadrant\\",
					      \\"zone_name\\": \\"delta.quadrant\\"
					    }
					  ],
					  \\"migrations\\": [
					    {
					      \\"tag\\": \\"some-migration-tag\\",
					      \\"new_classes\\": [
					        \\"DurabilitySameWorker\\"
					      ]
					    }
					  ],
					  \\"triggers\\": {
					    \\"crons\\": [
					      \\"0 0 0 * * *\\"
					    ]
					  },
					  \\"tail_consumers\\": [
					    {
					      \\"service\\": \\"listener\\"
					    }
					  ],
					  \\"observability\\": {
					    \\"enabled\\": true,
					    \\"head_sampling_rate\\": 0.5
					  },
					  \\"vars\\": {
					    \\"ANOTHER-NAME\\": \\"thing-TEXT\\"
					  },
					  \\"durable_objects\\": {
					    \\"bindings\\": [
					      {
					        \\"name\\": \\"DURABLE_TEST\\",
					        \\"class_name\\": \\"Durability\\",
					        \\"script_name\\": \\"another-durable-object-worker\\",
					        \\"environment\\": \\"production\\"
					      },
					      {
					        \\"name\\": \\"DURABLE_TEST_SAME_WORKER\\",
					        \\"class_name\\": \\"DurabilitySameWorker\\",
					        \\"script_name\\": \\"isolinear-optical-chip\\"
					      }
					    ]
					  },
					  \\"kv_namespaces\\": [
					    {
					      \\"id\\": \\"some-namespace-id\\",
					      \\"binding\\": \\"kv_testing\\"
					    }
					  ],
					  \\"r2_buckets\\": [
					    {
					      \\"binding\\": \\"test-bucket\\",
					      \\"bucket_name\\": \\"test-bucket\\"
					    }
					  ],
					  \\"services\\": [
					    {
					      \\"binding\\": \\"website\\",
					      \\"service\\": \\"website\\",
					      \\"environment\\": \\"production\\",
					      \\"entrypoint\\": \\"WWWHandler\\"
					    }
					  ],
					  \\"dispatch_namespaces\\": [
					    {
					      \\"binding\\": \\"name-namespace-mock\\",
					      \\"namespace\\": \\"namespace-mock\\"
					    }
					  ],
					  \\"logfwdr\\": {
					    \\"bindings\\": [
					      {
					        \\"name\\": \\"httplogs\\",
					        \\"destination\\": \\"httplogs\\"
					      },
					      {
					        \\"name\\": \\"trace\\",
					        \\"destination\\": \\"trace\\"
					      }
					    ]
					  },
					  \\"wasm_modules\\": {
					    \\"WASM_MODULE_ONE\\": \\"./some_wasm.wasm\\",
					    \\"WASM_MODULE_TWO\\": \\"./more_wasm.wasm\\"
					  },
					  \\"text_blobs\\": {
					    \\"TEXT_BLOB_ONE\\": \\"./my-entire-app-depends-on-this.cfg\\",
					    \\"TEXT_BLOB_TWO\\": \\"./the-entirety-of-human-knowledge.txt\\"
					  },
					  \\"d1_databases\\": [
					    {
					      \\"binding\\": \\"DB\\",
					      \\"database_id\\": \\"40160e84-9fdb-4ce7-8578-23893cecc5a3\\"
					    }
					  ],
					  \\"data_blobs\\": {
					    \\"DATA_BLOB_ONE\\": \\"DATA_BLOB_ONE\\",
					    \\"DATA_BLOB_TWO\\": \\"DATA_BLOB_TWO\\"
					  },
					  \\"unsafe\\": {
					    \\"bindings\\": [
					      {
					        \\"type\\": \\"some unsafe thing\\",
					        \\"name\\": \\"UNSAFE_BINDING_ONE\\",
					        \\"data\\": {
					          \\"some\\": {
					            \\"unsafe\\": \\"thing\\"
					          }
					        }
					      },
					      {
					        \\"type\\": \\"another unsafe thing\\",
					        \\"name\\": \\"UNSAFE_BINDING_TWO\\",
					        \\"data\\": 1337
					      },
					      {
					        \\"type\\": \\"inherit\\",
					        \\"name\\": \\"INHERIT_BINDING\\"
					      }
					    ]
					  },
					  \\"pipelines\\": [
					    {
					      \\"binding\\": \\"PIPELINE_BINDING\\",
					      \\"pipeline\\": \\"some-name\\"
					    }
					  ],
					  \\"mtls_certificates\\": [
					    {
					      \\"binding\\": \\"MTLS_BINDING\\",
					      \\"certificate_id\\": \\"some-id\\"
					    }
					  ],
					  \\"hyperdrive\\": [
					    {
					      \\"binding\\": \\"HYPER_BINDING\\",
					      \\"id\\": \\"some-id\\"
					    }
					  ],
					  \\"vectorize\\": [
					    {
					      \\"binding\\": \\"VECTOR_BINDING\\",
					      \\"index_name\\": \\"some-name\\"
					    }
					  ],
					  \\"queues\\": {
					    \\"producers\\": [
					      {
					        \\"binding\\": \\"queue_BINDING\\",
					        \\"queue\\": \\"some-name\\",
					        \\"delivery_delay\\": 1
					      }
					    ]
					  },
					  \\"send_email\\": [
					    {
					      \\"name\\": \\"EMAIL_BINDING\\",
					      \\"destination_address\\": \\"some@address.com\\",
					      \\"allowed_destination_addresses\\": [
					        \\"some2@address.com\\"
					      ],
					      \\"allowed_sender_addresses\\": [
					        \\"some2@address.com\\"
					      ]
					    }
					  ],
					  \\"version_metadata\\": {
					    \\"binding\\": \\"Version_BINDING\\"
					  }
					}"
				`);

			checkFiles({
				items: {
					"isolinear-optical-chip/src/index.js": {
						contents: worker.content,
					},
					"isolinear-optical-chip/wrangler.jsonc": wranglerToml({
						...mockConfigExpected,
						name: "isolinear-optical-chip",
					}),
				},
			});
		});

		it("should download source script from dashboard as plain JavaScript", async () => {
			worker = makeWorker({ id: "isolinear-optical-chip" });

			await runWrangler(
				"init  --from-dash isolinear-optical-chip --no-delegate-c3"
			);

			checkFiles({
				items: {
					"isolinear-optical-chip/src/index.js": {
						contents: worker.content,
					},
					"isolinear-optical-chip/src/index.ts": false,
					"isolinear-optical-chip/tsconfig.json": false,
					"isolinear-optical-chip/wrangler.jsonc": wranglerToml({
						...mockConfigExpected,
						name: "isolinear-optical-chip",
						main: "src/index.js",
					}),
				},
			});
		});

		it("should include user limits", async () => {
			worker = makeWorker({
				id: "isolinear-optical-chip",
				limits: {
					cpu_ms: 75,
				},
			});

			const { config } = await downloadWorker(
				"LCARS",
				"isolinear-optical-chip"
			);
			expect(config).toMatchObject({
				...mockConfigExpected,
				main: "index.js",
				limits: {
					cpu_ms: 75,
				},
			});
		});

		it.each(["bundled", "unbound", "standard"])(
			"should ignore usage_model = %s",
			async (usage_model) => {
				worker = makeWorker({
					id: "isolinear-optical-chip",
					usage_model,
				});

				const { config } = await downloadWorker(
					"LCARS",
					"isolinear-optical-chip"
				);
				expect(config).toMatchObject({
					...mockConfigExpected,
					main: "index.js",
				});
				// @ts-expect-error This property no longer exists
				expect(config.usage_model).toBeUndefined();
			}
		);

		it("should use fallback compatibility date if none is upstream", async () => {
			worker = makeWorker({
				id: "isolinear-optical-chip",
				compatibility_date: null,
			});

			const mockDate = "2000-01-01";
			vi.spyOn(Date.prototype, "toISOString").mockImplementation(
				() => `${mockDate}T00:00:00.000Z`
			);

			await runWrangler(
				"init  --from-dash isolinear-optical-chip --no-delegate-c3"
			);

			checkFiles({
				items: {
					"isolinear-optical-chip/src/index.js": {
						contents: worker.content,
					},
					"isolinear-optical-chip/wrangler.jsonc": wranglerToml({
						...mockConfigExpected,
						compatibility_date: mockDate,
						name: "isolinear-optical-chip",
					}),
				},
			});
		});

		it("should throw an error to retry if a request fails", async () => {
			worker = makeWorker({
				id: "isolinear-optical-chip",
			});
			msw.use(
				http.get(
					`*/accounts/:accountId/workers/services/:scriptName/environments/:environment/bindings`,
					() => {
						return HttpResponse.error();
					}
				)
			);

			await expect(
				runWrangler("init --from-dash isolinear-optical-chip --no-delegate-c3")
			).rejects.toThrowError();

			expect(std.err).toMatchInlineSnapshot(`
				"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mError Occurred: Unable to fetch bindings, routes, or services metadata from the dashboard. Please try again later.[0m

				"
			`);
		});

		it("should not include migrations in config file when none are necessary", async () => {
			worker = makeWorker({
				id: "isolinear-optical-chip",
				schedules: [],
				bindings: [],
				routes: [],
				compatibility_date: "1988-08-07",
			});

			await runWrangler(
				"init --from-dash isolinear-optical-chip --no-delegate-c3"
			);

			checkFiles({
				items: {
					"isolinear-optical-chip/wrangler.jsonc": wranglerToml({
						compatibility_date: "1988-08-07",
						main: "src/index.js",
						workers_dev: true,
						name: "isolinear-optical-chip",
						tail_consumers: [{ service: "listener" }],
						observability: {
							enabled: true,
							head_sampling_rate: 0.5,
						},
					}),
				},
			});
		});

		it("should not continue if no worker name is provided", async () => {
			await expect(
				runWrangler("init --from-dash")
			).rejects.toMatchInlineSnapshot(
				`[Error: Not enough arguments following: from-dash]`
			);
			checkFiles({
				items: {
					"isolinear-optical-chip/src/index.js": false,
					"isolinear-optical-chip/src/index.ts": false,
					"isolinear-optical-chip/package.json": false,
					"isolinear-optical-chip/tsconfig.json": false,
					"isolinear-optical-chip/wrangler.jsonc": false,
				},
			});
		});

		it("should download multi-module source scripts from dashboard", async () => {
			const fd = new FormData();
			fd.set(
				"index.js",
				new File(
					[
						dedent/*javascript*/ `
								import handleRequest from './other.js';

								export default {
									async fetch(request, env, ctx) {
										return handleRequest(request, env, ctx);
									},
								};
							`,
					],
					"index.js",
					{ type: "application/javascript+module" }
				)
			);
			fd.set(
				"other.js",
				new File(
					[
						dedent/*javascript*/ `
								export default function (request, env, ctx) {
									return new Response("Hello World!");
								}
							`,
					],
					"other.js",
					{ type: "application/javascript+module" }
				)
			);
			worker = makeWorker({
				main: "index.js",
				id: "isolinear-optical-chip",
				content: fd,
			});

			await runWrangler(
				"init --from-dash isolinear-optical-chip  --no-delegate-c3"
			);

			checkFiles({
				items: {
					"isolinear-optical-chip/src/index.js": {
						contents: await (fd.get("index.js") as File).text(),
					},
					"isolinear-optical-chip/src/other.js": {
						contents: await (fd.get("other.js") as File).text(),
					},
					"isolinear-optical-chip/src/index.ts": false,
					"isolinear-optical-chip/tsconfig.json": false,
					"isolinear-optical-chip/wrangler.jsonc": wranglerToml({
						...mockConfigExpected,
						name: "isolinear-optical-chip",
						main: "src/index.js",
					}),
				},
			});
		});
	});
});

/**
 * Check that the given test folders/files match what is in on disk.
 */
function checkFiles(folder: TestFolder, cwd = process.cwd()) {
	for (const name in folder.items) {
		const item = folder.items[name];
		const itemPath = path.resolve(cwd, name);
		if (typeof item === "boolean") {
			if (fs.existsSync(itemPath) !== item) {
				throw new Error(`Expected ${itemPath} ${item ? "" : "not "}to exist.`);
			}
		} else if ("contents" in item) {
			const actualContents = parse(name, fs.readFileSync(itemPath, "utf-8"));
			expect(actualContents).toEqual(item.contents);
		} else if ("items" in item) {
			checkFiles(item, itemPath);
		} else {
			throw new Error("Unexpected TestFile object.");
		}
	}
}

function parse(name: string, value: string): unknown {
	if (name.endsWith(".toml")) {
		return TOML.parse(value);
	}
	if (name.endsWith("tsconfig.json")) {
		return parseConfigFileTextToJson(name, value);
	}
	if (name.endsWith(".json") || name.endsWith(".jsonc")) {
		return JSON.parse(value);
	}
	return value;
}

function wranglerToml(options: RawConfig = {}): TestFile {
	return {
		contents: options,
	};
}

interface TestFile {
	contents: unknown;
}
interface TestFolder {
	items: {
		[id: string]: TestFile | TestFolder | boolean;
	};
}
