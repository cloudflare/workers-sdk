import {
	MiniflareOptionsSchemaV5 as MiniflareOptionsSchema,
	SharedOptionsSchemaV5 as SharedOptionsSchema,
	WorkerOptionsSchemaV5 as WorkerOptionsSchema,
} from "miniflare";
import { describe, test } from "vitest";
import type { z } from "zod";

// Compile-time assertions that `env`/`exports` inputs are properly typed
// (not `unknown`/`Record<string, unknown>`). These are checked by `tsc` via
// the `check:type` script — a regression to `unknown` would make the
// `@ts-expect-error` directives below become unused and fail the type-check.
type WorkerConfigInput = z.input<typeof WorkerOptionsSchema>["config"];
type EnvInput = NonNullable<WorkerConfigInput["env"]>;
type ExportsInput = NonNullable<WorkerConfigInput["exports"]>;

const kUnsafeEphemeralUniqueKey = Symbol.for(
	"miniflare.kUnsafeEphemeralUniqueKey"
);

function workerConfigBase(
	overrides?: Record<string, unknown>
): Record<string, unknown> {
	return {
		type: "worker",
		name: "test-worker",
		compatibilityDate: "2025-01-01",
		manifest: {
			mainModule: "index.js",
			modules: {
				"index.js": { type: "esm", contents: "export default {}" },
			},
		},
		...overrides,
	};
}

describe("WorkerOptionsSchema", () => {
	describe("config", () => {
		test("accepts minimal valid config", ({ expect }) => {
			expect(
				WorkerOptionsSchema.safeParse({ config: workerConfigBase() }).success
			).toBe(true);
		});

		test("requires name", ({ expect }) => {
			expect(
				WorkerOptionsSchema.safeParse({
					config: workerConfigBase({ name: undefined }),
				}).success
			).toBe(false);
		});

		test("requires compatibilityDate", ({ expect }) => {
			expect(
				WorkerOptionsSchema.safeParse({
					config: workerConfigBase({ compatibilityDate: undefined }),
				}).success
			).toBe(false);
		});
	});

	describe("manifest", () => {
		test("accepts all module types including binary contents", ({ expect }) => {
			expect(
				WorkerOptionsSchema.safeParse({
					config: workerConfigBase({
						manifest: {
							mainModule: "index.js",
							modules: {
								"index.js": { type: "esm", contents: "export default {}" },
								"common.cjs": { type: "cjs", contents: "" },
								"script.py": { type: "python", contents: "" },
								"requirements.txt": {
									type: "python-requirement",
									contents: "",
								},
								"util.wasm": {
									type: "wasm",
									contents: new Uint8Array([0, 1, 2]),
								},
								"data.txt": { type: "text", contents: "" },
								"data.bin": { type: "data", contents: "" },
								"config.json": { type: "json", contents: "" },
								"index.js.map": { type: "sourcemap", contents: "" },
							},
						},
					}),
				}).success
			).toBe(true);
		});

		test("manifest is optional", ({ expect }) => {
			expect(
				WorkerOptionsSchema.safeParse({
					config: workerConfigBase({ manifest: undefined }),
				}).success
			).toBe(true);
		});

		test("rejects manifest module without contents", ({ expect }) => {
			expect(
				WorkerOptionsSchema.safeParse({
					config: workerConfigBase({
						manifest: {
							mainModule: "index.js",
							modules: { "index.js": { type: "esm" } },
						},
					}),
				}).success
			).toBe(false);
		});

		test("rejects unknown module type", ({ expect }) => {
			expect(
				WorkerOptionsSchema.safeParse({
					config: workerConfigBase({
						manifest: {
							mainModule: "index.js",
							modules: { "index.js": { type: "unknown", contents: "" } },
						},
					}),
				}).success
			).toBe(false);
		});
	});

	describe("env — standard bindings", () => {
		test("accepts standard binding types", ({ expect }) => {
			expect(
				WorkerOptionsSchema.safeParse({
					config: workerConfigBase({
						env: {
							MY_KV: { type: "kv", id: "abc123" },
							MY_D1: { type: "d1", id: "db-id" },
							MY_R2: { type: "r2", name: "my-bucket" },
							MY_AI: { type: "ai" },
							MY_QUEUE: { type: "queue", name: "my-queue" },
							MY_VAR: { type: "json", value: { key: "value" } },
							MY_SECRET: { type: "text", value: "secret-value" },
							MY_DO: {
								type: "durable-object",
								workerName: "worker",
								exportName: "MyDO",
							},
							MY_SERVICE: {
								type: "worker",
								workerName: "other-worker",
								exportName: "MyEntrypoint",
							},
						},
					}),
				}).success
			).toBe(true);
		});

		test("rejects binding without type", ({ expect }) => {
			expect(
				WorkerOptionsSchema.safeParse({
					config: workerConfigBase({
						env: { INVALID: { name: "no-type-field" } },
					}),
				}).success
			).toBe(false);
		});
	});

	describe("env — miniflare-only bindings", () => {
		test("accepts miniflare-only binding types", ({ expect }) => {
			expect(
				WorkerOptionsSchema.safeParse({
					config: workerConfigBase({
						env: {
							MY_FETCHER: {
								type: "fetcher",
								handler: () => new Response("ok"),
							},
							MY_NODE: {
								type: "node-handler",
								handler: (_req: unknown, _res: unknown) => {},
							},
							MY_BROWSER_HEADFUL: { type: "browser", headful: true },
							MY_BROWSER: { type: "browser", remote: true },
						},
					}),
				}).success
			).toBe(true);
		});

		test("rejects fetcher binding without handler", ({ expect }) => {
			expect(
				WorkerOptionsSchema.safeParse({
					config: workerConfigBase({
						env: { MY_FETCHER: { type: "fetcher" } },
					}),
				}).success
			).toBe(false);
		});

		test("rejects fetcher binding with non-function handler", ({ expect }) => {
			expect(
				WorkerOptionsSchema.safeParse({
					config: workerConfigBase({
						env: {
							MY_FETCHER: { type: "fetcher", handler: "not-a-function" },
						},
					}),
				}).success
			).toBe(false);
		});

		test("rejects node-handler binding without handler", ({ expect }) => {
			expect(
				WorkerOptionsSchema.safeParse({
					config: workerConfigBase({
						env: { MY_NODE: { type: "node-handler" } },
					}),
				}).success
			).toBe(false);
		});
	});

	describe("env — unsafe bindings", () => {
		// Config bindings (including `unsafe:*`) are validated upstream by the
		// config schema, so miniflare passes them through unchanged.
		test("accepts unsafe binding with dev plugin and options", ({ expect }) => {
			expect(
				WorkerOptionsSchema.safeParse({
					config: workerConfigBase({
						env: {
							MY_UNSAFE: {
								type: "unsafe:my-custom",
								dev: {
									plugin: {
										name: "my-plugin",
										package: "@example/my-plugin",
									},
									options: { foo: "bar" },
								},
								extraField: "passthrough",
							},
						},
					}),
				}).success
			).toBe(true);
		});
	});

	describe("triggers", () => {
		test("accepts all trigger types", ({ expect }) => {
			expect(
				WorkerOptionsSchema.safeParse({
					config: workerConfigBase({
						triggers: [
							{ type: "email", addresses: ["support@example.com"] },
							{ type: "fetch", pattern: "example.com/*", zone: "example.com" },
							{
								type: "queue",
								name: "my-queue",
								maxBatchSize: 10,
								maxBatchTimeout: 5,
								maxRetries: 3,
								deadLetterQueue: "dlq",
								maxConcurrency: null,
								visibilityTimeoutMs: 1000,
								retryDelay: 2,
							},
							{ type: "scheduled", schedule: "0 * * * *" },
						],
					}),
				}).success
			).toBe(true);
		});

		test("rejects queue trigger without name", ({ expect }) => {
			expect(
				WorkerOptionsSchema.safeParse({
					config: workerConfigBase({ triggers: [{ type: "queue" }] }),
				}).success
			).toBe(false);
		});

		test("rejects unknown trigger type", ({ expect }) => {
			expect(
				WorkerOptionsSchema.safeParse({
					config: workerConfigBase({ triggers: [{ type: "unknown" }] }),
				}).success
			).toBe(false);
		});
	});

	describe("exports", () => {
		test("accepts durable-object export extensions and non-DO passthrough", ({
			expect,
		}) => {
			expect(
				WorkerOptionsSchema.safeParse({
					config: workerConfigBase({
						exports: {
							PlainDO: { type: "durable-object", storage: "sqlite" },
							KeyStringDO: {
								type: "durable-object",
								storage: "sqlite",
								unsafeUniqueKey: "my-custom-key",
							},
							KeySymbolDO: {
								type: "durable-object",
								storage: "sqlite",
								unsafeUniqueKey: kUnsafeEphemeralUniqueKey,
							},
							NoEvictDO: {
								type: "durable-object",
								storage: "sqlite",
								unsafePreventEviction: true,
							},
							ContainerDO: {
								type: "durable-object",
								storage: "sqlite",
								container: { imageName: "my-image" },
							},
							MyEntrypoint: { type: "worker", cache: { enabled: true } },
							DeletedDO: { type: "durable-object", state: "deleted" },
						},
					}),
				}).success
			).toBe(true);
		});
	});

	describe("dev config", () => {
		test("accepts dev config options", ({ expect }) => {
			expect(
				WorkerOptionsSchema.safeParse({
					config: workerConfigBase(),
					dev: {
						disableCache: true,
						unsafeEvalBinding: "__eval",
						useModuleFallbackService: true,
						outboundService: {
							type: "worker",
							workerName: "outbound-worker",
						},
						unsafeDirectSockets: [
							{ host: "localhost", port: 8787, proxy: true },
						],
					},
				}).success
			).toBe(true);
		});

		test("accepts outboundService as a fetcher binding", ({ expect }) => {
			expect(
				WorkerOptionsSchema.safeParse({
					config: workerConfigBase(),
					dev: {
						outboundService: {
							type: "fetcher",
							handler: () => new Response("intercepted"),
						},
					},
				}).success
			).toBe(true);
		});

		test("rejects outboundService as a bare function", ({ expect }) => {
			expect(
				WorkerOptionsSchema.safeParse({
					config: workerConfigBase(),
					dev: { outboundService: () => new Response("intercepted") },
				}).success
			).toBe(false);
		});

		test("dev is optional", ({ expect }) => {
			expect(
				WorkerOptionsSchema.safeParse({ config: workerConfigBase() }).success
			).toBe(true);
		});
	});

	describe("legacy config", () => {
		test("accepts legacy bindings and Workers Sites config", ({ expect }) => {
			expect(
				WorkerOptionsSchema.safeParse({
					config: workerConfigBase(),
					legacy: {
						wasmBindings: { MY_WASM: "module.wasm" },
						textBlobBindings: { MY_TEXT: "file.txt" },
						dataBlobBindings: { MY_DATA: new Uint8Array([1, 2, 3]) },
						sitePath: "./public",
						siteInclude: ["*.html"],
						siteExclude: ["*.map"],
					},
				}).success
			).toBe(true);
		});

		test("legacy is optional", ({ expect }) => {
			expect(
				WorkerOptionsSchema.safeParse({ config: workerConfigBase() }).success
			).toBe(true);
		});
	});

	describe("env/exports input typing", () => {
		test("env input is a typed binding record", ({ expect }) => {
			const env: EnvInput = {
				MY_KV: { type: "kv", id: "abc123" },
				MY_D1: { type: "d1", id: "db-id" },
				MY_UNSAFE: { type: "unsafe:custom", anything: true },
			};
			const bad: EnvInput = {
				// @ts-expect-error known bindings are strictly typed — `nope` is not a
				// valid `kv` field, so this must not be assignable.
				MY_KV: { type: "kv", nope: true },
			};
			expect(env.MY_KV).toBeDefined();
			expect(bad.MY_KV).toBeDefined();
		});

		test("exports input is a typed export record", ({ expect }) => {
			const exports: ExportsInput = {
				MyDO: {
					type: "durable-object",
					storage: "sqlite",
					unsafePreventEviction: true,
				},
			};
			const bad: ExportsInput = {
				// @ts-expect-error `storage` must be a valid enum value.
				MyDO: { type: "durable-object", storage: "invalid" },
			};
			expect(exports.MyDO).toBeDefined();
			expect(bad.MyDO).toBeDefined();
		});
	});
});

describe("SharedOptionsSchema", () => {
	test("accepts shared options", ({ expect }) => {
		expect(
			SharedOptionsSchema.safeParse({
				host: "0.0.0.0",
				port: 8787,
				https: true,
				httpsKey: "key-content",
				httpsCert: "cert-content",
				inspectorPort: 9229,
				inspectorHost: "127.0.0.1",
				resourcePersistencePath: ".wrangler/state/v3",
				resourceTmpPath: ".wrangler/tmp",
				containerEngine: {
					localDocker: { socketPath: "/var/run/docker.sock" },
				},
				log: { loggerLevel: 0, log: () => {} },
				handleStructuredLogs: () => {},
				handleUncaughtError: () => {},
				unsafeModuleFallbackService: () => new Response("fallback"),
				unsafeDevRegistryPath: "/tmp/dev-registry",
				unsafeProxySharedSecret: "secret",
				unsafeTriggerHandlers: true,
				unsafeLocalExplorer: true,
				unsafeInspectDurableObjects: true,
				unsafeRuntimeEnv: { NODE_ENV: "development" },
			}).success
		).toBe(true);
	});

	test("accepts empty shared options", ({ expect }) => {
		expect(SharedOptionsSchema.safeParse({}).success).toBe(true);
	});

	test("accepts containerEngine as a string", ({ expect }) => {
		expect(
			SharedOptionsSchema.safeParse({ containerEngine: "/usr/bin/docker" })
				.success
		).toBe(true);
	});

	test("defaults logRequests to true and telemetry.enabled to false", ({
		expect,
	}) => {
		const result = SharedOptionsSchema.parse({});
		expect(result.logRequests).toBe(true);
		expect(result.telemetry.enabled).toBe(false);
	});
});

describe("MiniflareOptionsSchema", () => {
	test("accepts shared options combined with multiple workers", ({
		expect,
	}) => {
		expect(
			MiniflareOptionsSchema.safeParse({
				host: "localhost",
				port: 8787,
				resourcePersistencePath: ".wrangler/state",
				workers: [
					{
						config: workerConfigBase({ name: "worker-1" }),
						dev: { disableCache: true },
					},
					{ config: workerConfigBase({ name: "worker-2" }) },
				],
			}).success
		).toBe(true);
	});

	test("rejects missing workers array", ({ expect }) => {
		expect(MiniflareOptionsSchema.safeParse({}).success).toBe(false);
	});

	test("rejects invalid worker in array", ({ expect }) => {
		expect(
			MiniflareOptionsSchema.safeParse({
				workers: [
					{ config: workerConfigBase() },
					{ config: { name: "missing-compat-date" } },
				],
			}).success
		).toBe(false);
	});
});
