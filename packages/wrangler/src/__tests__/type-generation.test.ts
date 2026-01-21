import * as fs from "node:fs";
import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import {
	constructTSModuleGlob,
	constructTypeKey,
	generateImportSpecifier,
	isValidIdentifier,
} from "../type-generation";
import {
	ENV_HEADER_COMMENT_PREFIX,
	getEnvHeader,
	throwMissingBindingError,
	toEnvInterfaceName,
	TOP_LEVEL_ENV_NAME,
	toPascalCase,
	validateEnvInterfaceNames,
} from "../type-generation/helpers";
import * as generateRuntime from "../type-generation/runtime";
import { dedent } from "../utils/dedent";
import { mockConsoleMethods } from "./helpers/mock-console";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import type { EnvironmentNonInheritable } from "@cloudflare/workers-utils";
import type { MockInstance } from "vitest";

describe("isValidIdentifier", () => {
	it("should return true for valid identifiers", () => {
		expect(isValidIdentifier("valid")).toBe(true);
		expect(isValidIdentifier("valid123")).toBe(true);
		expect(isValidIdentifier("valid_123")).toBe(true);
		expect(isValidIdentifier("valid_123_")).toBe(true);
		expect(isValidIdentifier("_valid_123_")).toBe(true);
		expect(isValidIdentifier("_valid_123_")).toBe(true);
		expect(isValidIdentifier("$valid")).toBe(true);
		expect(isValidIdentifier("$valid$")).toBe(true);
	});

	it("should return false for invalid identifiers", () => {
		expect(isValidIdentifier("123invalid")).toBe(false);
		expect(isValidIdentifier("invalid-123")).toBe(false);
		expect(isValidIdentifier("invalid 123")).toBe(false);
	});
});

describe("constructTypeKey", () => {
	it("should return a valid type key", () => {
		expect(constructTypeKey("valid")).toBe("valid");
		expect(constructTypeKey("valid123")).toBe("valid123");
		expect(constructTypeKey("valid_123")).toBe("valid_123");
		expect(constructTypeKey("valid_123_")).toBe("valid_123_");
		expect(constructTypeKey("_valid_123_")).toBe("_valid_123_");
		expect(constructTypeKey("_valid_123_")).toBe("_valid_123_");
		expect(constructTypeKey("$valid")).toBe("$valid");
		expect(constructTypeKey("$valid$")).toBe("$valid$");

		expect(constructTypeKey("123invalid")).toBe('"123invalid"');
		expect(constructTypeKey("invalid-123")).toBe('"invalid-123"');
		expect(constructTypeKey("invalid 123")).toBe('"invalid 123"');
	});
});

describe("constructTSModuleGlob() should return a valid TS glob ", () => {
	it.each([
		["**/*.wasm", "*.wasm"],
		["**/*.txt", "*.txt"],
		["**/foo", "*/foo"],
		["**/*foo", "*foo"],
		["file.foo", "file.foo"],
		["folder/file.foo", "folder/file.foo"],
		["folder/*", "folder/*"],
		["folder/**", "folder/*"],
		["folder/**/*", "folder/*"],
	])("$1 -> $2", (from, to) => {
		expect(constructTSModuleGlob(from)).toBe(to);
	});
});

describe("generateImportSpecifier", () => {
	it("should generate a relative import specifier", () => {
		expect(generateImportSpecifier("/app/types.ts", "/app/index.ts")).toBe(
			"./index"
		);
		expect(
			generateImportSpecifier("/app/types.ts", "/app/src/deep/dir/index.ts")
		).toBe("./src/deep/dir/index");
		expect(
			generateImportSpecifier("/app/deep/dir/index.ts", "/app/types.ts")
		).toBe("../../types");

		expect(generateImportSpecifier("/app/types.ts", "/app/src/index.mjs")).toBe(
			"./src/index"
		);
	});
});

describe("getEnvHeader", () => {
	it("should generate a header with the provided hash and command", () => {
		const result = getEnvHeader("abc123", "wrangler types");
		expect(result).toBe(
			`${ENV_HEADER_COMMENT_PREFIX} \`wrangler types\` (hash: abc123)`
		);
	});

	it("should include complex commands with flags", () => {
		const result = getEnvHeader(
			"def456",
			"wrangler types --strict-vars=false --env-interface=MyEnv"
		);
		expect(result).toBe(
			`${ENV_HEADER_COMMENT_PREFIX} \`wrangler types --strict-vars=false --env-interface=MyEnv\` (hash: def456)`
		);
	});

	it("should handle empty hash", () => {
		const result = getEnvHeader("", "wrangler types");
		expect(result).toBe(
			`${ENV_HEADER_COMMENT_PREFIX} \`wrangler types\` (hash: )`
		);
	});

	it("should use process.argv when command is not provided", () => {
		const originalArgv = process.argv;
		process.argv = ["node", "wrangler", "types", "--include-runtime=false"];

		try {
			const result = getEnvHeader("xyz789");
			expect(result).toBe(
				`${ENV_HEADER_COMMENT_PREFIX} \`wrangler types --include-runtime=false\` (hash: xyz789)`
			);
		} finally {
			process.argv = originalArgv;
		}
	});
});

describe("toPascalCase", () => {
	it("should convert simple strings to PascalCase", () => {
		expect(toPascalCase("staging")).toBe("Staging");
		expect(toPascalCase("production")).toBe("Production");
	});

	it("should convert kebab-case to PascalCase", () => {
		expect(toPascalCase("my-prod-env")).toBe("MyProdEnv");
		expect(toPascalCase("staging-env")).toBe("StagingEnv");
	});

	it("should convert snake_case to PascalCase", () => {
		expect(toPascalCase("my_test_env")).toBe("MyTestEnv");
		expect(toPascalCase("prod_env")).toBe("ProdEnv");
	});

	it("should handle mixed separators", () => {
		expect(toPascalCase("my-test_env")).toBe("MyTestEnv");
	});
});

describe("toEnvInterfaceName", () => {
	it("should add Env suffix to environment names", () => {
		expect(toEnvInterfaceName("staging")).toBe("StagingEnv");
		expect(toEnvInterfaceName("production")).toBe("ProductionEnv");
	});

	it("should deduplicate Env suffix", () => {
		expect(toEnvInterfaceName("staging-env")).toBe("StagingEnv");
		expect(toEnvInterfaceName("prod-env")).toBe("ProdEnv");
		expect(toEnvInterfaceName("my_env")).toBe("MyEnv");
	});

	it("should handle kebab-case environment names", () => {
		expect(toEnvInterfaceName("my-prod")).toBe("MyProdEnv");
		expect(toEnvInterfaceName("test-staging")).toBe("TestStagingEnv");
	});
});

describe("validateEnvInterfaceNames", () => {
	it("should not throw for valid, unique environment names", () => {
		expect(() =>
			validateEnvInterfaceNames(["staging", "production", "dev"])
		).not.toThrow();
	});

	it("should throw for reserved name Env", () => {
		expect(() => validateEnvInterfaceNames(["env"])).toThrowError(
			/Environment name "env" converts to reserved interface name "Env"/
		);
	});

	it("should throw when two environment names convert to the same interface name", () => {
		// Both staging-env and staging_env convert to StagingEnv
		expect(() =>
			validateEnvInterfaceNames(["staging-env", "staging_env"])
		).toThrowError(
			/Environment names "staging-env" and "staging_env" both convert to interface name "StagingEnv"/
		);
	});

	it("should throw when names with different separators collide", () => {
		expect(() =>
			validateEnvInterfaceNames(["my-prod", "my_prod"])
		).toThrowError(
			/Environment names "my-prod" and "my_prod" both convert to interface name "MyProdEnv"/
		);
	});
});

describe("throwMissingBindingError", () => {
	it("should throw a `UserError` for top-level bindings with array index", () => {
		expect(() =>
			throwMissingBindingError({
				binding: { id: "1234" },
				bindingType: "kv_namespaces",
				configPath: "wrangler.json",
				envName: TOP_LEVEL_ENV_NAME,
				fieldName: "binding",
				index: 0,
			})
		).toThrowError(
			'Processing wrangler.json configuration:\n  - "kv_namespaces[0]" bindings should have a string "binding" field but got {"id":"1234"}.'
		);
	});

	it("should throw a `UserError` for environment bindings with array index", () => {
		expect(() =>
			throwMissingBindingError({
				binding: { database_id: "abc123" },
				bindingType: "d1_databases",
				configPath: "wrangler.json",
				envName: "production",
				fieldName: "binding",
				index: 2,
			})
		).toThrowError(
			'Processing wrangler.json configuration:\n  - "env.production" environment configuration\n    - "env.production.d1_databases[2]" bindings should have a string "binding" field but got {"database_id":"abc123"}.'
		);
	});

	it("should handle non-array bindings (index omitted)", () => {
		expect(() =>
			throwMissingBindingError({
				binding: {},
				bindingType: "ai",
				configPath: "wrangler.json",
				envName: TOP_LEVEL_ENV_NAME,
				fieldName: "binding",
			})
		).toThrowError(
			'Processing wrangler.json configuration:\n  - "ai" bindings should have a string "binding" field but got {}.'
		);
	});

	it("should handle undefined config path", () => {
		expect(() =>
			throwMissingBindingError({
				binding: {},
				bindingType: "kv_namespaces",
				configPath: undefined,
				envName: TOP_LEVEL_ENV_NAME,
				fieldName: "binding",
				index: 0,
			})
		).toThrowError(
			'Processing Wrangler configuration configuration:\n  - "kv_namespaces[0]" bindings should have a string "binding" field but got {}.'
		);
	});

	it("should handle different field names", () => {
		expect(() =>
			throwMissingBindingError({
				binding: { type: "ratelimit" },
				bindingType: "unsafe",
				configPath: "wrangler.json",
				envName: "staging",
				fieldName: "name",
				index: 1,
			})
		).toThrowError(
			'Processing wrangler.json configuration:\n  - "env.staging" environment configuration\n    - "env.staging.unsafe[1]" bindings should have a string "name" field but got {"type":"ratelimit"}.'
		);
	});
});

const bindingsConfigMock: Omit<
	EnvironmentNonInheritable,
	"define" | "tail_consumers" | "cloudchamber"
> &
	Record<string, unknown> = {
	kv_namespaces: [{ binding: "TEST_KV_NAMESPACE", id: "1234" }],
	vars: {
		SOMETHING: "asdasdfasdf",
		ANOTHER: "thing",
		OBJECT_VAR: {
			enterprise: "1701-D",
			activeDuty: true,
			captain: "Picard",
		}, // We can assume the objects will be stringified
		"some-other-var": "some-other-value",
	},
	queues: {
		producers: [
			{
				binding: "TEST_QUEUE_BINDING",
				queue: "TEST_QUEUE",
			},
		],
		consumers: [
			{
				queue: "my-queue",
				max_batch_size: 10,
				max_batch_timeout: 1,
				max_retries: 3,
			},
		],
	},
	durable_objects: {
		bindings: [
			{ name: "DURABLE_DIRECT_EXPORT", class_name: "DurableDirect" },
			{ name: "DURABLE_RE_EXPORT", class_name: "DurableReexport" },
			{ name: "DURABLE_NO_EXPORT", class_name: "DurableNoexport" },
			{
				name: "DURABLE_EXTERNAL_UNKNOWN_ENTRY",
				class_name: "DurableExternal",
				script_name: "external-worker",
			},
			{
				name: "DURABLE_EXTERNAL_PROVIDED_ENTRY",
				class_name: "RealDurableExternal",
				script_name: "service_name_2",
			},
		],
	},
	migrations: [
		{
			tag: "v1",
			new_classes: ["RandomDo"],
		},
		{
			tag: "v2",
			new_sqlite_classes: ["DurableReexport"],
			renamed_classes: [
				{
					from: "RandomDo",
					to: "DurableDirect",
				},
			],
		},
	],
	workflows: [
		{
			name: "workflows",
			binding: "MY_WORKFLOW",
			class_name: "MyWorkflow",
		},
	],
	containers: undefined,
	r2_buckets: [
		{
			binding: "R2_BUCKET_BINDING",
			bucket_name: "r2bucket-name-test",
		},
	],
	d1_databases: [
		{
			binding: "D1_TESTING_SOMETHING",
			database_name: "D1_BINDING",
			database_id: "1234",
		},
	],
	secrets_store_secrets: [
		{
			binding: "SECRET",
			store_id: "store_id",
			secret_name: "secret_name",
		},
	],
	unsafe_hello_world: [
		{
			binding: "HELLO_WORLD",
			enable_timer: true,
		},
	],
	services: [
		{ binding: "SERVICE_BINDING", service: "service_name" },
		{
			binding: "OTHER_SERVICE_BINDING",
			service: "service_name_2",
			entrypoint: "FakeEntrypoint",
		},
		{
			binding: "OTHER_SERVICE_BINDING_ENTRYPOINT",
			service: "service_name_2",
			entrypoint: "RealEntrypoint",
		},
	],
	analytics_engine_datasets: [
		{
			binding: "AE_DATASET_BINDING",
			dataset: "AE_DATASET_TEST",
		},
	],
	dispatch_namespaces: [
		{ binding: "NAMESPACE_BINDING", namespace: "NAMESPACE_ID" },
	],
	send_email: [{ name: "SEND_EMAIL_BINDING" }],
	vectorize: [{ binding: "VECTORIZE_BINDING", index_name: "VECTORIZE_NAME" }],
	hyperdrive: [{ binding: "HYPERDRIVE_BINDING", id: "HYPERDRIVE_ID" }],
	mtls_certificates: [
		{ binding: "MTLS_BINDING", certificate_id: "MTLS_CERTIFICATE_ID" },
	],
	browser: {
		binding: "BROWSER_BINDING",
	},
	ai: {
		binding: "AI_BINDING",
	},
	images: {
		binding: "IMAGES_BINDING",
	},
	media: {
		binding: "MEDIA_BINDING",
	},
	version_metadata: {
		binding: "VERSION_METADATA_BINDING",
	},
	logfwdr: {
		bindings: [{ name: "LOGFWDR_BINDING", destination: "LOGFWDR_DESTINATION" }],
	},
	data_blobs: {
		SOME_DATA_BLOB1: "SOME_DATA_BLOB1.bin",
		SOME_DATA_BLOB2: "SOME_DATA_BLOB2.bin",
	},
	text_blobs: {
		SOME_TEXT_BLOB1: "SOME_TEXT_BLOB1.txt",
		SOME_TEXT_BLOB2: "SOME_TEXT_BLOB2.txt",
	},
	wasm_modules: { MODULE1: "module1.wasm", MODULE2: "module2.wasm" },
	unsafe: {
		bindings: [
			{ name: "testing_unsafe", type: "plain_text" },
			{ name: "UNSAFE_RATELIMIT", type: "ratelimit" },
		],
		metadata: { some_key: "some_value" },
	},
	rules: [
		{
			type: "Text",
			globs: ["**/*.txt"],
			fallthrough: true,
		},
		{
			type: "Data",
			globs: ["**/*.webp"],
			fallthrough: true,
		},
		{ type: "CompiledWasm", globs: ["**/*.wasm"], fallthrough: true },
	],
	pipelines: [{ binding: "PIPELINE", pipeline: "my-pipeline" }],
	assets: {
		binding: "ASSETS_BINDING",
		directory: "/assets",
	},
	ratelimits: [
		{
			name: "RATE_LIMITER",
			namespace_id: "1001",
			simple: {
				limit: 5,
				period: 60,
			},
		},
	],
	worker_loaders: [
		{
			binding: "WORKER_LOADER_BINDING",
		},
	],
	vpc_services: [
		{
			binding: "VPC_SERVICE_BINDING",
			service_id: "0199295b-b3ac-7760-8246-bca40877b3e9",
		},
	],
};

describe("generate types", () => {
	let spy: MockInstance;
	const std = mockConsoleMethods();
	const originalColumns = process.stdout.columns;
	runInTempDir();

	beforeAll(() => {
		process.stdout.columns = 60;
	});

	afterAll(() => {
		process.stdout.columns = originalColumns;
	});
	beforeEach(() => {
		spy = vi
			.spyOn(generateRuntime, "generateRuntimeTypes")
			.mockImplementation(async () => ({
				runtimeHeader: "// Runtime types generated with workerd@",
				runtimeTypes: "<runtime types go here>",
			}));
		fs.writeFileSync(
			"./tsconfig.json",
			JSON.stringify({
				compilerOptions: { types: ["worker-configuration.d.ts"] },
			})
		);
	});
	it("should error when no config file is detected", async () => {
		await expect(runWrangler("types")).rejects.toMatchInlineSnapshot(
			`[Error: No config file detected. This command requires a Wrangler configuration file.]`
		);
	});

	it("should error when a specified custom config file is missing", async () => {
		await expect(() =>
			runWrangler("types -c hello.toml")
		).rejects.toMatchInlineSnapshot(
			`[ParseError: Could not read file: hello.toml]`
		);
	});

	it("should respect the top level -c|--config flag", async () => {
		fs.writeFileSync(
			"./wrangler.jsonc",
			JSON.stringify({
				compatibility_date: "2022-01-12",
				compatibility_flags: ["fake-compat-1"],
				vars: {
					var: "from wrangler toml",
				},
			}),
			"utf-8"
		);

		fs.writeFileSync(
			"./my-wrangler-config-a.jsonc",
			JSON.stringify({
				compatibility_date: "2023-01-12",
				compatibility_flags: ["fake-compat-2"],
				vars: {
					var: "from my-wrangler-config-a",
				},
			}),
			"utf-8"
		);

		fs.writeFileSync(
			"./my-wrangler-config-b.jsonc",
			JSON.stringify({
				compatibility_date: "2024-01-12",
				compatibility_flags: ["fake-compat-3"],
				vars: {
					var: "from my-wrangler-config-b",
				},
			}),
			"utf-8"
		);

		await runWrangler("types");
		expect(spy).toHaveBeenNthCalledWith(1, {
			config: expect.objectContaining({
				compatibility_date: "2022-01-12",
				compatibility_flags: ["fake-compat-1"],
			}),
			outFile: "worker-configuration.d.ts",
		});

		await runWrangler("types --config ./my-wrangler-config-a.jsonc");
		expect(spy).toHaveBeenNthCalledWith(2, {
			config: expect.objectContaining({
				compatibility_date: "2023-01-12",
				compatibility_flags: ["fake-compat-2"],
			}),
			outFile: "worker-configuration.d.ts",
		});

		await runWrangler("types -c my-wrangler-config-b.jsonc");
		expect(spy).toHaveBeenNthCalledWith(3, {
			config: expect.objectContaining({
				compatibility_date: "2024-01-12",
				compatibility_flags: ["fake-compat-3"],
			}),
			outFile: "worker-configuration.d.ts",
		});
		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			Generating project types...

			declare namespace Cloudflare {
				interface Env {
					var: \\"from wrangler toml\\";
				}
			}
			interface Env extends Cloudflare.Env {}

			Generating runtime types...

			Runtime types generated.

			────────────────────────────────────────────────────────────
			✨ Types written to worker-configuration.d.ts

			📖 Read about runtime types
			https://developers.cloudflare.com/workers/languages/typescript/#generate-types
			📣 Remember to rerun 'wrangler types' after you change your wrangler.jsonc file.


			 ⛅️ wrangler x.x.x
			──────────────────
			Generating project types...

			declare namespace Cloudflare {
				interface Env {
					var: \\"from my-wrangler-config-a\\";
				}
			}
			interface Env extends Cloudflare.Env {}

			Generating runtime types...

			Runtime types generated.

			────────────────────────────────────────────────────────────
			✨ Types written to worker-configuration.d.ts

			📖 Read about runtime types
			https://developers.cloudflare.com/workers/languages/typescript/#generate-types
			📣 Remember to rerun 'wrangler types' after you change your wrangler.jsonc file.


			 ⛅️ wrangler x.x.x
			──────────────────
			Generating project types...

			declare namespace Cloudflare {
				interface Env {
					var: \\"from my-wrangler-config-b\\";
				}
			}
			interface Env extends Cloudflare.Env {}

			Generating runtime types...

			Runtime types generated.

			────────────────────────────────────────────────────────────
			✨ Types written to worker-configuration.d.ts

			📖 Read about runtime types
			https://developers.cloudflare.com/workers/languages/typescript/#generate-types
			📣 Remember to rerun 'wrangler types' after you change your wrangler.jsonc file.
			"
		`);
	});

	it("should log the interface type generated and declare modules", async () => {
		fs.writeFileSync(
			"./index.ts",
			`import { DurableObject, WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers';
				export default { async fetch () {} };
				export class DurableDirect extends DurableObject {}
				export { DurableReexport } from './durable-2.js';
				// This should not be picked up, because it's external:
				export class DurableExternal extends DurableObject {}

			type Params = { email: string; metadata: Record<string, string> };
			export class MyWorkflow extends WorkflowEntrypoint<Env, Params> {
				async run(event: WorkflowEvent<Params>, step: WorkflowStep) { }
			}`
		);
		fs.writeFileSync(
			"./wrangler.jsonc",
			JSON.stringify({
				compatibility_date: "2022-01-12",
				name: "test-name",
				main: "./index.ts",
				...bindingsConfigMock,
				unsafe: bindingsConfigMock.unsafe,
			}),
			"utf-8"
		);

		await runWrangler("types --include-runtime=false");
		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			Generating project types...

			declare namespace Cloudflare {
				interface GlobalProps {
					mainModule: typeof import(\\"./index\\");
					durableNamespaces: \\"DurableDirect\\" | \\"DurableReexport\\";
				}
				interface Env {
					TEST_KV_NAMESPACE: KVNamespace;
					R2_BUCKET_BINDING: R2Bucket;
					D1_TESTING_SOMETHING: D1Database;
					VECTORIZE_BINDING: VectorizeIndex;
					HYPERDRIVE_BINDING: Hyperdrive;
					SEND_EMAIL_BINDING: SendEmail;
					AE_DATASET_BINDING: AnalyticsEngineDataset;
					NAMESPACE_BINDING: DispatchNamespace;
					MTLS_BINDING: Fetcher;
					TEST_QUEUE_BINDING: Queue;
					SECRET: SecretsStoreSecret;
					HELLO_WORLD: HelloWorldBinding;
					RATE_LIMITER: RateLimit;
					WORKER_LOADER_BINDING: WorkerLoader;
					VPC_SERVICE_BINDING: Fetcher;
					PIPELINE: import(\\"cloudflare:pipelines\\").Pipeline<import(\\"cloudflare:pipelines\\").PipelineRecord>;
					LOGFWDR_SCHEMA: any;
					BROWSER_BINDING: Fetcher;
					AI_BINDING: Ai;
					IMAGES_BINDING: ImagesBinding;
					MEDIA_BINDING: MediaBinding;
					VERSION_METADATA_BINDING: WorkerVersionMetadata;
					ASSETS_BINDING: Fetcher;
					SOMETHING: \\"asdasdfasdf\\";
					ANOTHER: \\"thing\\";
					OBJECT_VAR: {\\"enterprise\\":\\"1701-D\\",\\"activeDuty\\":true,\\"captain\\":\\"Picard\\"};
					\\"some-other-var\\": \\"some-other-value\\";
					DURABLE_DIRECT_EXPORT: DurableObjectNamespace<import(\\"./index\\").DurableDirect>;
					DURABLE_RE_EXPORT: DurableObjectNamespace<import(\\"./index\\").DurableReexport>;
					DURABLE_NO_EXPORT: DurableObjectNamespace /* DurableNoexport */;
					DURABLE_EXTERNAL_UNKNOWN_ENTRY: DurableObjectNamespace /* DurableExternal from external-worker */;
					DURABLE_EXTERNAL_PROVIDED_ENTRY: DurableObjectNamespace /* RealDurableExternal from service_name_2 */;
					SERVICE_BINDING: Fetcher /* service_name */;
					OTHER_SERVICE_BINDING: Service /* entrypoint FakeEntrypoint from service_name_2 */;
					OTHER_SERVICE_BINDING_ENTRYPOINT: Service /* entrypoint RealEntrypoint from service_name_2 */;
					MY_WORKFLOW: Workflow<Parameters<import(\\"./index\\").MyWorkflow['run']>[0]['payload']>;
					testing_unsafe: any;
					UNSAFE_RATELIMIT: RateLimit;
					SOME_DATA_BLOB1: ArrayBuffer;
					SOME_DATA_BLOB2: ArrayBuffer;
					SOME_TEXT_BLOB1: string;
					SOME_TEXT_BLOB2: string;
				}
			}
			interface Env extends Cloudflare.Env {}
			declare module \\"*.txt\\" {
				const value: string;
				export default value;
			}
			declare module \\"*.webp\\" {
				const value: ArrayBuffer;
				export default value;
			}
			declare module \\"*.wasm\\" {
				const value: WebAssembly.Module;
				export default value;
			}
			────────────────────────────────────────────────────────────
			✨ Types written to worker-configuration.d.ts

			📣 Remember to rerun 'wrangler types' after you change your wrangler.jsonc file.
			"
		`);
	});

	it("should include stringified process.env types for vars, secrets, and json", async () => {
		fs.writeFileSync(
			"./index.ts",
			`import { DurableObject, WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers';
				export default { async fetch () {} };
				export class DurableDirect extends DurableObject {}
				export { DurableReexport } from './durable-2.js';
				// This should not be picked up, because it's external:
				export class DurableExternal extends DurableObject {}

			type Params = { email: string; metadata: Record<string, string> };
			export class MyWorkflow extends WorkflowEntrypoint<Env, Params> {
				async run(event: WorkflowEvent<Params>, step: WorkflowStep) { }
			}`
		);
		fs.writeFileSync(
			"./wrangler.jsonc",
			JSON.stringify({
				compatibility_date: "2022-01-12",
				compatibility_flags: [
					"nodejs_compat",
					"nodejs_compat_populate_process_env",
				],
				name: "test-name",
				main: "./index.ts",
				...bindingsConfigMock,
				unsafe: bindingsConfigMock.unsafe,
			}),
			"utf-8"
		);
		fs.writeFileSync("./.dev.vars", "SECRET=test", "utf-8");

		await runWrangler("types --include-runtime=false");
		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			Generating project types...

			declare namespace Cloudflare {
				interface GlobalProps {
					mainModule: typeof import(\\"./index\\");
					durableNamespaces: \\"DurableDirect\\" | \\"DurableReexport\\";
				}
				interface Env {
					TEST_KV_NAMESPACE: KVNamespace;
					R2_BUCKET_BINDING: R2Bucket;
					D1_TESTING_SOMETHING: D1Database;
					VECTORIZE_BINDING: VectorizeIndex;
					HYPERDRIVE_BINDING: Hyperdrive;
					SEND_EMAIL_BINDING: SendEmail;
					AE_DATASET_BINDING: AnalyticsEngineDataset;
					NAMESPACE_BINDING: DispatchNamespace;
					MTLS_BINDING: Fetcher;
					TEST_QUEUE_BINDING: Queue;
					SECRET: SecretsStoreSecret;
					HELLO_WORLD: HelloWorldBinding;
					RATE_LIMITER: RateLimit;
					WORKER_LOADER_BINDING: WorkerLoader;
					VPC_SERVICE_BINDING: Fetcher;
					PIPELINE: import(\\"cloudflare:pipelines\\").Pipeline<import(\\"cloudflare:pipelines\\").PipelineRecord>;
					LOGFWDR_SCHEMA: any;
					BROWSER_BINDING: Fetcher;
					AI_BINDING: Ai;
					IMAGES_BINDING: ImagesBinding;
					MEDIA_BINDING: MediaBinding;
					VERSION_METADATA_BINDING: WorkerVersionMetadata;
					ASSETS_BINDING: Fetcher;
					SOMETHING: \\"asdasdfasdf\\";
					ANOTHER: \\"thing\\";
					OBJECT_VAR: {\\"enterprise\\":\\"1701-D\\",\\"activeDuty\\":true,\\"captain\\":\\"Picard\\"};
					\\"some-other-var\\": \\"some-other-value\\";
					SECRET: string;
					DURABLE_DIRECT_EXPORT: DurableObjectNamespace<import(\\"./index\\").DurableDirect>;
					DURABLE_RE_EXPORT: DurableObjectNamespace<import(\\"./index\\").DurableReexport>;
					DURABLE_NO_EXPORT: DurableObjectNamespace /* DurableNoexport */;
					DURABLE_EXTERNAL_UNKNOWN_ENTRY: DurableObjectNamespace /* DurableExternal from external-worker */;
					DURABLE_EXTERNAL_PROVIDED_ENTRY: DurableObjectNamespace /* RealDurableExternal from service_name_2 */;
					SERVICE_BINDING: Fetcher /* service_name */;
					OTHER_SERVICE_BINDING: Service /* entrypoint FakeEntrypoint from service_name_2 */;
					OTHER_SERVICE_BINDING_ENTRYPOINT: Service /* entrypoint RealEntrypoint from service_name_2 */;
					MY_WORKFLOW: Workflow<Parameters<import(\\"./index\\").MyWorkflow['run']>[0]['payload']>;
					testing_unsafe: any;
					UNSAFE_RATELIMIT: RateLimit;
					SOME_DATA_BLOB1: ArrayBuffer;
					SOME_DATA_BLOB2: ArrayBuffer;
					SOME_TEXT_BLOB1: string;
					SOME_TEXT_BLOB2: string;
				}
			}
			interface Env extends Cloudflare.Env {}
			type StringifyValues<EnvType extends Record<string, unknown>> = {
				[Binding in keyof EnvType]: EnvType[Binding] extends string ? EnvType[Binding] : string;
			};
			declare namespace NodeJS {
				interface ProcessEnv extends StringifyValues<Pick<Cloudflare.Env, \\"SOMETHING\\" | \\"ANOTHER\\" | \\"OBJECT_VAR\\" | \\"some-other-var\\" | \\"SECRET\\">> {}
			}
			declare module \\"*.txt\\" {
				const value: string;
				export default value;
			}
			declare module \\"*.webp\\" {
				const value: ArrayBuffer;
				export default value;
			}
			declare module \\"*.wasm\\" {
				const value: WebAssembly.Module;
				export default value;
			}
			────────────────────────────────────────────────────────────
			✨ Types written to worker-configuration.d.ts

			📣 Remember to rerun 'wrangler types' after you change your wrangler.jsonc file.
			"
		`);
	});

	it("should handle multiple worker configs", async () => {
		fs.mkdirSync("a");

		fs.writeFileSync(
			"./a/index.ts",
			`import { DurableObject, WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers';
				export default { async fetch () {} };
				export class DurableDirect extends DurableObject {}

			type Params = { email: string; metadata: Record<string, string> };
			export class MyWorkflow extends WorkflowEntrypoint<Env, Params> {
				async run(event: WorkflowEvent<Params>, step: WorkflowStep) { }
			}`
		);
		fs.writeFileSync(
			"./a/wrangler.jsonc",
			JSON.stringify({
				compatibility_date: "2022-01-12",
				compatibility_flags: [
					"nodejs_compat",
					"nodejs_compat_populate_process_env",
				],
				name: "test-name",
				main: "./index.ts",
				...bindingsConfigMock,
				unsafe: bindingsConfigMock.unsafe,
			}),
			"utf-8"
		);
		fs.writeFileSync("./a/.dev.vars", "SECRET=test", "utf-8");

		fs.mkdirSync("b");

		fs.writeFileSync("./b/index.ts", `export default { async fetch () {} };`);
		fs.writeFileSync(
			"./b/wrangler.jsonc",
			JSON.stringify({
				compatibility_date: "2022-01-12",
				compatibility_flags: [
					"nodejs_compat",
					"nodejs_compat_populate_process_env",
				],
				name: "service_name",
				main: "./index.ts",
				vars: {
					// This should not be included in the generated types
					WORKER_B_VAR: "worker b var",
				},
			}),
			"utf-8"
		);
		// This should not be included in the generated types
		fs.writeFileSync("./b/.dev.vars", "SECRET_B=hidden", "utf-8");

		fs.mkdirSync("c");

		fs.writeFileSync(
			"./c/index.ts",
			`import { DurableObject, WorkerEntrypoint } from 'cloudflare:workers';
				export default { async fetch () {} };

				export class RealDurableExternal extends DurableObject {}

				export class RealEntrypoint extends WorkerEntrypoint {}
				`
		);
		fs.writeFileSync(
			"./c/wrangler.jsonc",
			JSON.stringify({
				compatibility_date: "2022-01-12",
				compatibility_flags: [
					"nodejs_compat",
					"nodejs_compat_populate_process_env",
				],
				name: "service_name_2",
				main: "./index.ts",
				vars: {
					// This should not be included in the generated types
					WORKER_C_VAR: "worker c var",
				},
			}),
			"utf-8"
		);
		// This should not be included in the generated types
		fs.writeFileSync("./c/.dev.vars", "SECRET_C=hidden", "utf-8");

		await runWrangler(
			"types --include-runtime=false -c a/wrangler.jsonc -c b/wrangler.jsonc -c c/wrangler.jsonc --path a/worker-configuration.d.ts"
		);
		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			- Found Worker 'service_name' at 'b/index.ts' (b/wrangler.jsonc)
			- Found Worker 'service_name_2' at 'c/index.ts' (c/wrangler.jsonc)
			Generating project types...

			declare namespace Cloudflare {
				interface GlobalProps {
					mainModule: typeof import(\\"./index\\");
					durableNamespaces: \\"DurableDirect\\" | \\"DurableReexport\\";
				}
				interface Env {
					TEST_KV_NAMESPACE: KVNamespace;
					R2_BUCKET_BINDING: R2Bucket;
					D1_TESTING_SOMETHING: D1Database;
					VECTORIZE_BINDING: VectorizeIndex;
					HYPERDRIVE_BINDING: Hyperdrive;
					SEND_EMAIL_BINDING: SendEmail;
					AE_DATASET_BINDING: AnalyticsEngineDataset;
					NAMESPACE_BINDING: DispatchNamespace;
					MTLS_BINDING: Fetcher;
					TEST_QUEUE_BINDING: Queue;
					SECRET: SecretsStoreSecret;
					HELLO_WORLD: HelloWorldBinding;
					RATE_LIMITER: RateLimit;
					WORKER_LOADER_BINDING: WorkerLoader;
					VPC_SERVICE_BINDING: Fetcher;
					PIPELINE: import(\\"cloudflare:pipelines\\").Pipeline<import(\\"cloudflare:pipelines\\").PipelineRecord>;
					LOGFWDR_SCHEMA: any;
					BROWSER_BINDING: Fetcher;
					AI_BINDING: Ai;
					IMAGES_BINDING: ImagesBinding;
					MEDIA_BINDING: MediaBinding;
					VERSION_METADATA_BINDING: WorkerVersionMetadata;
					ASSETS_BINDING: Fetcher;
					SOMETHING: \\"asdasdfasdf\\";
					ANOTHER: \\"thing\\";
					OBJECT_VAR: {\\"enterprise\\":\\"1701-D\\",\\"activeDuty\\":true,\\"captain\\":\\"Picard\\"};
					\\"some-other-var\\": \\"some-other-value\\";
					SECRET: string;
					DURABLE_DIRECT_EXPORT: DurableObjectNamespace<import(\\"./index\\").DurableDirect>;
					DURABLE_RE_EXPORT: DurableObjectNamespace /* DurableReexport */;
					DURABLE_NO_EXPORT: DurableObjectNamespace /* DurableNoexport */;
					DURABLE_EXTERNAL_UNKNOWN_ENTRY: DurableObjectNamespace /* DurableExternal from external-worker */;
					DURABLE_EXTERNAL_PROVIDED_ENTRY: DurableObjectNamespace<import(\\"../c/index\\").RealDurableExternal>;
					SERVICE_BINDING: Service<typeof import(\\"../b/index\\").default>;
					OTHER_SERVICE_BINDING: Service /* entrypoint FakeEntrypoint from service_name_2 */;
					OTHER_SERVICE_BINDING_ENTRYPOINT: Service<typeof import(\\"../c/index\\").RealEntrypoint>;
					MY_WORKFLOW: Workflow<Parameters<import(\\"./index\\").MyWorkflow['run']>[0]['payload']>;
					testing_unsafe: any;
					UNSAFE_RATELIMIT: RateLimit;
					SOME_DATA_BLOB1: ArrayBuffer;
					SOME_DATA_BLOB2: ArrayBuffer;
					SOME_TEXT_BLOB1: string;
					SOME_TEXT_BLOB2: string;
				}
			}
			interface Env extends Cloudflare.Env {}
			type StringifyValues<EnvType extends Record<string, unknown>> = {
				[Binding in keyof EnvType]: EnvType[Binding] extends string ? EnvType[Binding] : string;
			};
			declare namespace NodeJS {
				interface ProcessEnv extends StringifyValues<Pick<Cloudflare.Env, \\"SOMETHING\\" | \\"ANOTHER\\" | \\"OBJECT_VAR\\" | \\"some-other-var\\" | \\"SECRET\\">> {}
			}
			declare module \\"*.txt\\" {
				const value: string;
				export default value;
			}
			declare module \\"*.webp\\" {
				const value: ArrayBuffer;
				export default value;
			}
			declare module \\"*.wasm\\" {
				const value: WebAssembly.Module;
				export default value;
			}
			────────────────────────────────────────────────────────────
			✨ Types written to a/worker-configuration.d.ts

			📣 Remember to rerun 'wrangler types' after you change your wrangler.jsonc file.
			"
		`);
	});

	it("should create a DTS file at the location that the command is executed from", async () => {
		fs.writeFileSync("./index.ts", "export default { async fetch () {} };");
		fs.writeFileSync(
			"./wrangler.jsonc",
			JSON.stringify({
				compatibility_date: "2022-01-12",
				name: "test-name",
				main: "./index.ts",
				vars: bindingsConfigMock.vars,
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
			} as any),
			"utf-8"
		);
		await runWrangler("types");
		expect(fs.existsSync("./worker-configuration.d.ts")).toBe(true);
		expect(fs.readFileSync("./worker-configuration.d.ts", "utf-8"))
			.toMatchInlineSnapshot(`
				"/* eslint-disable */
				// Generated by Wrangler by running \`wrangler\` (hash: d172d29d98306b9c96cfcaf16aef9056)
				// Runtime types generated with workerd@
				declare namespace Cloudflare {
					interface GlobalProps {
						mainModule: typeof import(\\"./index\\");
					}
					interface Env {
						SOMETHING: \\"asdasdfasdf\\";
						ANOTHER: \\"thing\\";
						OBJECT_VAR: {\\"enterprise\\":\\"1701-D\\",\\"activeDuty\\":true,\\"captain\\":\\"Picard\\"};
						\\"some-other-var\\": \\"some-other-value\\";
					}
				}
				interface Env extends Cloudflare.Env {}

				// Begin runtime types
				<runtime types go here>"
			`);
	});

	describe("when nothing was found", () => {
		it("should not create DTS file for service syntax workers if env only", async () => {
			fs.writeFileSync(
				"./index.ts",
				'addEventListener("fetch", event => { event.respondWith(() => new Response("")); })'
			);
			fs.writeFileSync(
				"./wrangler.jsonc",
				JSON.stringify({
					compatibility_date: "2022-01-12",
					name: "test-name",
					main: "./index.ts",
				}),
				"utf-8"
			);

			await runWrangler("types --include-runtime=false");
			expect(fs.existsSync("./worker-configuration.d.ts")).toBe(false);
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Generating project types...

				No project types to add.

				────────────────────────────────────────────────────────────
				📣 Remember to rerun 'wrangler types' after you change your wrangler.jsonc file.
				"
			`);
		});

		it("should create DTS file for service syntax workers with runtime types only", async () => {
			fs.writeFileSync(
				"./index.ts",
				'addEventListener("fetch", event => { event.respondWith(() => new Response("")); })'
			);
			fs.writeFileSync(
				"./wrangler.jsonc",
				JSON.stringify({
					compatibility_date: "2022-01-12",
					name: "test-name",
					main: "./index.ts",
				}),
				"utf-8"
			);

			await runWrangler("types");
			expect(fs.readFileSync("./worker-configuration.d.ts", "utf8"))
				.toMatchInlineSnapshot(`
					"/* eslint-disable */
					// Runtime types generated with workerd@
					// Begin runtime types
					<runtime types go here>"
				`);
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Generating project types...

				No project types to add.

				Generating runtime types...

				Runtime types generated.

				────────────────────────────────────────────────────────────
				✨ Types written to worker-configuration.d.ts

				📖 Read about runtime types
				https://developers.cloudflare.com/workers/languages/typescript/#generate-types
				📣 Remember to rerun 'wrangler types' after you change your wrangler.jsonc file.
				"
			`);
		});

		it("should create a DTS file with an empty env interface for module syntax workers", async () => {
			fs.writeFileSync("./index.ts", "export default { async fetch () {} };");
			fs.writeFileSync(
				"./wrangler.jsonc",
				JSON.stringify({
					compatibility_date: "2022-01-12",
					name: "test-name",
					main: "./index.ts",
				}),
				"utf-8"
			);

			await runWrangler("types --include-runtime=false");

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Generating project types...

				declare namespace Cloudflare {
					interface GlobalProps {
						mainModule: typeof import(\\"./index\\");
					}
					interface Env {
					}
				}
				interface Env extends Cloudflare.Env {}

				────────────────────────────────────────────────────────────
				✨ Types written to worker-configuration.d.ts

				📣 Remember to rerun 'wrangler types' after you change your wrangler.jsonc file.
				"
			`);
		});
	});

	it("should create a DTS file at the location that the command is executed from", async () => {
		fs.writeFileSync(
			"./worker-configuration.d.ts",
			"NOT THE CONTENTS OF THE GENERATED FILE"
		);
		fs.writeFileSync("./index.ts", "export default { async fetch () {} };");
		fs.writeFileSync(
			"./wrangler.jsonc",
			JSON.stringify({
				compatibility_date: "2022-01-12",
				name: "test-name",
				main: "./index.ts",
				vars: bindingsConfigMock.vars,
			}),
			"utf-8"
		);

		await expect(runWrangler("types")).rejects.toMatchInlineSnapshot(
			`[Error: A non-Wrangler worker-configuration.d.ts already exists, please rename and try again.]`
		);
		expect(fs.existsSync("./worker-configuration.d.ts")).toBe(true);
	});

	it("should log the declare global type generated and declare modules", async () => {
		fs.writeFileSync(
			"./index.ts",
			`addEventListener('fetch', event => {  event.respondWith(handleRequest(event.request));
		}); async function handleRequest(request) {  return new Response('Hello worker!', {headers: { 'content-type': 'text/plain' },});}`
		);
		fs.writeFileSync(
			"./wrangler.jsonc",
			JSON.stringify({
				compatibility_date: "2022-01-12",
				name: "test-name",
				main: "./index.ts",
				unsafe: bindingsConfigMock.unsafe
					? {
							bindings: bindingsConfigMock.unsafe.bindings,
							metadata: bindingsConfigMock.unsafe.metadata,
						}
					: undefined,
			}),
			"utf-8"
		);

		await runWrangler("types --include-runtime=false");
		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			Generating project types...

			export {};
			declare global {
				const testing_unsafe: any;
				const UNSAFE_RATELIMIT: RateLimit;
			}

			────────────────────────────────────────────────────────────
			✨ Types written to worker-configuration.d.ts

			📣 Remember to rerun 'wrangler types' after you change your wrangler.jsonc file.
			"
		`);
	});

	it("should accept a toml file without an entrypoint and fallback to the standard modules declarations", async () => {
		fs.writeFileSync(
			"./wrangler.jsonc",
			JSON.stringify({
				compatibility_date: "2022-01-12",
				vars: bindingsConfigMock.vars,
			}),
			"utf-8"
		);

		await runWrangler("types");
		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			Generating project types...

			declare namespace Cloudflare {
				interface Env {
					SOMETHING: \\"asdasdfasdf\\";
					ANOTHER: \\"thing\\";
					OBJECT_VAR: {\\"enterprise\\":\\"1701-D\\",\\"activeDuty\\":true,\\"captain\\":\\"Picard\\"};
					\\"some-other-var\\": \\"some-other-value\\";
				}
			}
			interface Env extends Cloudflare.Env {}

			Generating runtime types...

			Runtime types generated.

			────────────────────────────────────────────────────────────
			✨ Types written to worker-configuration.d.ts

			📖 Read about runtime types
			https://developers.cloudflare.com/workers/languages/typescript/#generate-types
			📣 Remember to rerun 'wrangler types' after you change your wrangler.jsonc file.
			"
		`);
	});

	it("should not error if expected entrypoint is not found and assume module worker", async () => {
		fs.writeFileSync(
			"./wrangler.jsonc",
			JSON.stringify({
				main: "index.ts",
				vars: bindingsConfigMock.vars,
			}),
			"utf-8"
		);
		expect(fs.existsSync("index.ts")).toEqual(false);

		await runWrangler("types --include-runtime=false");
		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			Generating project types...

			declare namespace Cloudflare {
				interface Env {
					SOMETHING: \\"asdasdfasdf\\";
					ANOTHER: \\"thing\\";
					OBJECT_VAR: {\\"enterprise\\":\\"1701-D\\",\\"activeDuty\\":true,\\"captain\\":\\"Picard\\"};
					\\"some-other-var\\": \\"some-other-value\\";
				}
			}
			interface Env extends Cloudflare.Env {}

			────────────────────────────────────────────────────────────
			✨ Types written to worker-configuration.d.ts

			📣 Remember to rerun 'wrangler types' after you change your wrangler.jsonc file.
			"
		`);
	});

	it("should include secret keys from .dev.vars", async () => {
		fs.writeFileSync(
			"./wrangler.jsonc",
			JSON.stringify({
				vars: {
					myTomlVarA: "A from wrangler toml",
					myTomlVarB: "B from wrangler toml",
				},
			}),
			"utf-8"
		);

		const localVarsEnvContent = dedent`
			# Preceding comment
			SECRET_A="A from .dev.vars"
			MULTI_LINE_SECRET="A: line 1
			line 2"
			UNQUOTED_SECRET= unquoted value
		`;
		fs.writeFileSync(".dev.vars", localVarsEnvContent, "utf8");

		// Add a .env file that will be ignored due to there being a .dev.vars file
		const dotEnvContent = dedent`
			# Preceding comment
			SECRET_A="A from .dev.vars"
			MULTI_LINE_SECRET="A: line 1
			line 2"
			UNQUOTED_SECRET= unquoted value
		`;
		fs.writeFileSync(".env", dotEnvContent, "utf8");

		await runWrangler("types --include-runtime=false");

		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			Generating project types...

			declare namespace Cloudflare {
				interface Env {
					myTomlVarA: \\"A from wrangler toml\\";
					myTomlVarB: \\"B from wrangler toml\\";
					SECRET_A: string;
					MULTI_LINE_SECRET: string;
					UNQUOTED_SECRET: string;
				}
			}
			interface Env extends Cloudflare.Env {}

			────────────────────────────────────────────────────────────
			✨ Types written to worker-configuration.d.ts

			📣 Remember to rerun 'wrangler types' after you change your wrangler.jsonc file.
			"
		`);
	});

	it("should use explicit --env-file instead of .dev.vars when both exist", async () => {
		fs.writeFileSync(
			"./wrangler.jsonc",
			JSON.stringify({
				vars: {
					myTomlVarA: "A from wrangler toml",
				},
			}),
			"utf-8"
		);

		// Create .dev.vars with secrets that should NOT appear
		const devVarsContent = dedent`
			SECRET_FROM_DEV_VARS="should not appear"
			ANOTHER_SECRET="also should not appear"
		`;
		fs.writeFileSync(".dev.vars", devVarsContent, "utf8");

		// Create .dev.vars.template with secrets that SHOULD appear
		const templateContent = dedent`
			SECRET_FROM_TEMPLATE="should appear"
			TEMPLATE_ONLY="only in template"
		`;
		fs.writeFileSync(".dev.vars.template", templateContent, "utf8");

		await runWrangler(
			"types --include-runtime=false --env-file=.dev.vars.template"
		);

		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			Generating project types...

			declare namespace Cloudflare {
				interface Env {
					myTomlVarA: \\"A from wrangler toml\\";
					SECRET_FROM_TEMPLATE: string;
					TEMPLATE_ONLY: string;
				}
			}
			interface Env extends Cloudflare.Env {}

			────────────────────────────────────────────────────────────
			✨ Types written to worker-configuration.d.ts

			📣 Remember to rerun 'wrangler types' after you change your wrangler.jsonc file.
			"
		`);
		// Verify that .dev.vars secrets are NOT included
		const out = std.out;
		expect(out).not.toContain("SECRET_FROM_DEV_VARS");
		expect(out).not.toContain("ANOTHER_SECRET");
	});

	it("should include secret keys from .env, if there is no .dev.vars", async () => {
		fs.writeFileSync(
			"./wrangler.jsonc",
			JSON.stringify({
				vars: {
					myTomlVarA: "A from wrangler toml",
					myTomlVarB: "B from wrangler toml",
				},
			}),
			"utf-8"
		);

		const dotEnvContent = dedent`
		# Preceding comment
		SECRET_A_DOT_ENV="A from .env"
		MULTI_LINE_SECRET="A: line 1
		line 2"
		UNQUOTED_SECRET= unquoted value
		`;
		fs.writeFileSync(".env", dotEnvContent, "utf8");

		await runWrangler("types --include-runtime=false");

		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			Generating project types...

			declare namespace Cloudflare {
				interface Env {
					myTomlVarA: \\"A from wrangler toml\\";
					myTomlVarB: \\"B from wrangler toml\\";
					SECRET_A_DOT_ENV: string;
					MULTI_LINE_SECRET: string;
					UNQUOTED_SECRET: string;
				}
			}
			interface Env extends Cloudflare.Env {}

			────────────────────────────────────────────────────────────
			✨ Types written to worker-configuration.d.ts

			📣 Remember to rerun 'wrangler types' after you change your wrangler.jsonc file.
			"
		`);
	});

	it("should allow opting out of strict-vars", async () => {
		fs.writeFileSync(
			"./wrangler.jsonc",
			JSON.stringify({
				vars: {
					varStr: "A from wrangler toml",
					varArrNum: [1, 2, 3],
					varArrMix: [1, "two", 3, true],
					varObj: { test: true },
				},
			}),
			"utf-8"
		);

		await runWrangler("types --strict-vars=false --include-runtime=false");

		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			Generating project types...

			declare namespace Cloudflare {
				interface Env {
					varStr: string;
					varArrNum: number[];
					varArrMix: (boolean|number|string)[];
					varObj: object;
				}
			}
			interface Env extends Cloudflare.Env {}

			────────────────────────────────────────────────────────────
			✨ Types written to worker-configuration.d.ts

			📣 Remember to rerun 'wrangler types' after you change your wrangler.jsonc file.
			"
		`);
	});

	it("should override vars with secrets", async () => {
		fs.writeFileSync(
			"./wrangler.jsonc",
			JSON.stringify({
				vars: {
					MY_VARIABLE_A: "my variable",
					MY_VARIABLE_B: { variable: true },
				},
			}),
			"utf-8"
		);

		const localVarsEnvContent = dedent`
		# Preceding comment
		MY_VARIABLE_A = "my secret"
		MY_VARIABLE_B = "my secret A"
		`;
		fs.writeFileSync(".dev.vars", localVarsEnvContent, "utf8");

		await runWrangler("types --include-runtime=false");

		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			Generating project types...

			declare namespace Cloudflare {
				interface Env {
					MY_VARIABLE_A: string;
					MY_VARIABLE_B: string;
				}
			}
			interface Env extends Cloudflare.Env {}

			────────────────────────────────────────────────────────────
			✨ Types written to worker-configuration.d.ts

			📣 Remember to rerun 'wrangler types' after you change your wrangler.jsonc file.
			"
		`);
	});

	it("various different types of vars", async () => {
		fs.writeFileSync(
			"./wrangler.jsonc",
			JSON.stringify({
				vars: {
					"var-a": '"a\\""',
					"var-a-1": '"a\\\\"',
					"var-a-b": '"a\\\\b"',
					"var-a-b-": '"a\\\\b\\""',
					1: 1,
					12345: 12345,
					true: true,
					false: false,
					"multi\nline\nvar": "this\nis\na\nmulti\nline\nvariable!",
				},
			}),
			"utf-8"
		);
		await runWrangler("types --include-runtime=false");

		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			Generating project types...

			declare namespace Cloudflare {
				interface Env {
					\\"1\\": 1;
					\\"12345\\": 12345;
					\\"var-a\\": \\"/\\"a///\\"/\\"\\";
					\\"var-a-1\\": \\"/\\"a/////\\"\\";
					\\"var-a-b\\": \\"/\\"a////b/\\"\\";
					\\"var-a-b-\\": \\"/\\"a////b///\\"/\\"\\";
					true: true;
					false: false;
					\\"multi
			line
			var\\": \\"this/nis/na/nmulti/nline/nvariable!\\";
				}
			}
			interface Env extends Cloudflare.Env {}

			────────────────────────────────────────────────────────────
			✨ Types written to worker-configuration.d.ts

			📣 Remember to rerun 'wrangler types' after you change your wrangler.jsonc file.
			"
		`);
	});

	describe("vars present in multiple environments", () => {
		beforeEach(() => {
			fs.writeFileSync(
				"./wrangler.jsonc",
				JSON.stringify({
					vars: {
						MY_VAR: "a var",
						MY_VAR_A: "A (dev)",
						MY_VAR_B: { value: "B (dev)" },
						MY_VAR_C: ["a", "b", "c"],
					},
					env: {
						production: {
							vars: {
								MY_VAR: "a var",
								MY_VAR_A: "A (prod)",
								MY_VAR_B: { value: "B (prod)" },
								MY_VAR_C: [1, 2, 3],
							},
						},
						staging: {
							vars: {
								MY_VAR_A: "A (stag)",
							},
						},
					},
				}),
				"utf-8"
			);
		});

		it("should produce string and union types for variables (default)", async () => {
			await runWrangler("types --include-runtime=false");

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Generating project types...

				declare namespace Cloudflare {
					interface ProductionEnv {
						MY_VAR: \\"a var\\";
						MY_VAR_A: \\"A (prod)\\";
						MY_VAR_B: {\\"value\\":\\"B (prod)\\"};
						MY_VAR_C: [1,2,3];
					}
					interface StagingEnv {
						MY_VAR_A: \\"A (stag)\\";
					}
					interface Env {
						MY_VAR?: \\"a var\\";
						MY_VAR_A: \\"A (prod)\\" | \\"A (stag)\\" | \\"A (dev)\\";
						MY_VAR_B?: {\\"value\\":\\"B (prod)\\"} | {\\"value\\":\\"B (dev)\\"};
						MY_VAR_C?: [1,2,3] | [\\"a\\",\\"b\\",\\"c\\"];
					}
				}
				interface Env extends Cloudflare.Env {}

				────────────────────────────────────────────────────────────
				✨ Types written to worker-configuration.d.ts

				📣 Remember to rerun 'wrangler types' after you change your wrangler.jsonc file.
				"
			`);
		});

		it("should produce non-strict types for variables (with --strict-vars=false)", async () => {
			await runWrangler("types --strict-vars=false --include-runtime=false");

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Generating project types...

				declare namespace Cloudflare {
					interface ProductionEnv {
						MY_VAR: string;
						MY_VAR_A: string;
						MY_VAR_B: object;
						MY_VAR_C: number[];
					}
					interface StagingEnv {
						MY_VAR_A: string;
					}
					interface Env {
						MY_VAR?: string;
						MY_VAR_A: string;
						MY_VAR_B?: object;
						MY_VAR_C?: number[] | string[];
					}
				}
				interface Env extends Cloudflare.Env {}

				────────────────────────────────────────────────────────────
				✨ Types written to worker-configuration.d.ts

				📣 Remember to rerun 'wrangler types' after you change your wrangler.jsonc file.
				"
			`);
		});
	});

	describe("bindings present in multiple environments", () => {
		it("should collect bindings from all environments when no --env is specified", async () => {
			fs.writeFileSync(
				"./wrangler.jsonc",
				JSON.stringify({
					d1_databases: [
						{
							binding: "D1_TOP",
							database_id: "top-d1-id",
							database_name: "top",
						},
					],
					kv_namespaces: [
						{
							binding: "KV_TOP",
							id: "top-kv-id",
						},
					],
					env: {
						staging: {
							d1_databases: [
								{
									binding: "D1_STAGING",
									database_id: "staging-d1-id",
									database_name: "staging",
								},
							],
							kv_namespaces: [
								{
									binding: "KV_STAGING",
									id: "staging-kv-id",
								},
							],
						},
						production: {
							kv_namespaces: [
								{
									binding: "KV_PROD",
									id: "prod-kv-id",
								},
							],
							r2_buckets: [
								{
									binding: "R2_PROD",
									bucket_name: "prod-bucket",
								},
							],
						},
					},
				}),
				"utf-8"
			);

			await runWrangler("types --include-runtime=false");

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Generating project types...

				declare namespace Cloudflare {
					interface StagingEnv {
						KV_STAGING: KVNamespace;
						D1_STAGING: D1Database;
					}
					interface ProductionEnv {
						KV_PROD: KVNamespace;
						R2_PROD: R2Bucket;
					}
					interface Env {
						KV_STAGING?: KVNamespace;
						D1_STAGING?: D1Database;
						KV_PROD?: KVNamespace;
						R2_PROD?: R2Bucket;
						KV_TOP?: KVNamespace;
						D1_TOP?: D1Database;
					}
				}
				interface Env extends Cloudflare.Env {}

				────────────────────────────────────────────────────────────
				✨ Types written to worker-configuration.d.ts

				📣 Remember to rerun 'wrangler types' after you change your wrangler.jsonc file.
				"
			`);
		});

		it("should only collect bindings from the specified environment when --env is used", async () => {
			fs.writeFileSync(
				"./wrangler.jsonc",
				JSON.stringify({
					kv_namespaces: [
						{
							binding: "KV_TOP",
							id: "top-kv-id",
						},
					],
					env: {
						staging: {
							d1_databases: [
								{
									binding: "D1_STAGING",
									database_id: "staging-d1-id",
									database_name: "staging",
								},
							],
							kv_namespaces: [
								{
									binding: "KV_STAGING",
									id: "staging-kv-id",
								},
							],
						},
						production: {
							kv_namespaces: [
								{
									binding: "KV_PROD",
									id: "prod-kv-id",
								},
							],
						},
					},
				}),
				"utf-8"
			);

			await runWrangler("types --include-runtime=false --env staging");

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Generating project types...

				declare namespace Cloudflare {
					interface Env {
						KV_STAGING: KVNamespace;
						D1_STAGING: D1Database;
					}
				}
				interface Env extends Cloudflare.Env {}

				────────────────────────────────────────────────────────────
				✨ Types written to worker-configuration.d.ts

				📣 Remember to rerun 'wrangler types' after you change your wrangler.jsonc file.
				"
			`);
		});

		it("should deduplicate bindings with the same name across environments", async () => {
			fs.writeFileSync(
				"./wrangler.jsonc",
				JSON.stringify({
					kv_namespaces: [
						{
							binding: "MY_KV",
							id: "top-kv-id",
						},
					],
					env: {
						staging: {
							kv_namespaces: [
								{
									binding: "MY_KV",
									id: "staging-kv-id",
								},
							],
						},
						production: {
							kv_namespaces: [
								{
									binding: "MY_KV",
									id: "prod-kv-id",
								},
							],
						},
					},
				}),
				"utf-8"
			);

			await runWrangler("types --include-runtime=false");

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Generating project types...

				declare namespace Cloudflare {
					interface StagingEnv {
						MY_KV: KVNamespace;
					}
					interface ProductionEnv {
						MY_KV: KVNamespace;
					}
					interface Env {
						MY_KV: KVNamespace;
					}
				}
				interface Env extends Cloudflare.Env {}

				────────────────────────────────────────────────────────────
				✨ Types written to worker-configuration.d.ts

				📣 Remember to rerun 'wrangler types' after you change your wrangler.jsonc file.
				"
			`);
		});

		it("should produce union types when binding name has different types across environments", async () => {
			fs.writeFileSync(
				"./wrangler.jsonc",
				JSON.stringify({
					kv_namespaces: [
						{
							binding: "CACHE",
							id: "kv-id",
						},
					],
					env: {
						staging: {
							r2_buckets: [
								{
									binding: "CACHE",
									bucket_name: "r2-bucket",
								},
							],
						},
					},
				}),
				"utf-8"
			);

			await runWrangler("types --include-runtime=false");

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Generating project types...

				declare namespace Cloudflare {
					interface StagingEnv {
						CACHE: R2Bucket;
					}
					interface Env {
						CACHE: R2Bucket | KVNamespace;
					}
				}
				interface Env extends Cloudflare.Env {}

				────────────────────────────────────────────────────────────
				✨ Types written to worker-configuration.d.ts

				📣 Remember to rerun 'wrangler types' after you change your wrangler.jsonc file.
				"
			`);
		});

		it("should error when a binding is missing its binding name in an environment", async () => {
			fs.writeFileSync(
				"./wrangler.jsonc",
				JSON.stringify({
					kv_namespaces: [
						{
							binding: "KV_TOP",
							id: "top-kv-id",
						},
					],
					env: {
						staging: {
							// Empty object with no binding property should error
							kv_namespaces: [{}],
						},
					},
				}),
				"utf-8"
			);

			await expect(
				runWrangler("types --include-runtime=false")
			).rejects.toThrowError(
				/Processing wrangler\.jsonc configuration:\n\s+- "env\.staging" environment configuration\n\s+- "env\.staging\.kv_namespaces\[0\]" bindings should have a string "binding" field but got \{\}/
			);
		});

		it("should error when a binding is missing its binding name at top-level", async () => {
			fs.writeFileSync(
				"./wrangler.jsonc",
				JSON.stringify({
					r2_buckets: [
						{
							bucket_name: "my-bucket",
						},
					],
				}),
				"utf-8"
			);

			await expect(
				runWrangler("types --include-runtime=false")
			).rejects.toThrowError(
				/Processing wrangler\.jsonc configuration:\n\s+- "r2_buckets\[0\]" bindings should have a string "binding" field/
			);
		});

		it("should collect vars only from specified environment with --env", async () => {
			fs.writeFileSync(
				"./wrangler.jsonc",
				JSON.stringify({
					vars: {
						MY_VAR: "top-level",
					},
					env: {
						staging: {
							vars: {
								MY_VAR: "staging",
								STAGING_ONLY: "staging-only-value",
							},
						},
						production: {
							vars: {
								MY_VAR: "production",
								PROD_ONLY: "prod-only-value",
							},
						},
					},
				}),
				"utf-8"
			);

			await runWrangler("types --include-runtime=false --env staging");

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Generating project types...

				declare namespace Cloudflare {
					interface Env {
						MY_VAR: \\"staging\\";
						STAGING_ONLY: \\"staging-only-value\\";
					}
				}
				interface Env extends Cloudflare.Env {}

				────────────────────────────────────────────────────────────
				✨ Types written to worker-configuration.d.ts

				📣 Remember to rerun 'wrangler types' after you change your wrangler.jsonc file.
				"
			`);
		});

		it("should mark bindings as optional if not present in all environments", async () => {
			fs.writeFileSync(
				"./wrangler.jsonc",
				JSON.stringify({
					kv_namespaces: [{ binding: "KV_SHARED", id: "top-kv" }],
					env: {
						staging: {
							kv_namespaces: [
								{ binding: "KV_SHARED", id: "staging-kv" },
								{ binding: "KV_STAGING_ONLY", id: "staging-only" },
							],
						},
						production: {
							kv_namespaces: [
								{ binding: "KV_SHARED", id: "prod-kv" },
								{ binding: "KV_PROD_ONLY", id: "prod-only" },
							],
						},
					},
				}),
				"utf-8"
			);

			await runWrangler("types --include-runtime=false");

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Generating project types...

				declare namespace Cloudflare {
					interface StagingEnv {
						KV_SHARED: KVNamespace;
						KV_STAGING_ONLY: KVNamespace;
					}
					interface ProductionEnv {
						KV_SHARED: KVNamespace;
						KV_PROD_ONLY: KVNamespace;
					}
					interface Env {
						KV_SHARED: KVNamespace;
						KV_STAGING_ONLY?: KVNamespace;
						KV_PROD_ONLY?: KVNamespace;
					}
				}
				interface Env extends Cloudflare.Env {}

				────────────────────────────────────────────────────────────
				✨ Types written to worker-configuration.d.ts

				📣 Remember to rerun 'wrangler types' after you change your wrangler.jsonc file.
				"
			`);
		});

		it("should not include top-level bindings in per-environment interfaces", async () => {
			fs.writeFileSync(
				"./wrangler.jsonc",
				JSON.stringify({
					kv_namespaces: [{ binding: "KV_TOP_ONLY", id: "top-kv" }],
					env: {
						staging: {
							d1_databases: [
								{
									binding: "D1_STAGING",
									database_id: "staging-d1",
									database_name: "staging",
								},
							],
						},
					},
				}),
				"utf-8"
			);

			await runWrangler("types --include-runtime=false");

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Generating project types...

				declare namespace Cloudflare {
					interface StagingEnv {
						D1_STAGING: D1Database;
					}
					interface Env {
						D1_STAGING?: D1Database;
						KV_TOP_ONLY?: KVNamespace;
					}
				}
				interface Env extends Cloudflare.Env {}

				────────────────────────────────────────────────────────────
				✨ Types written to worker-configuration.d.ts

				📣 Remember to rerun 'wrangler types' after you change your wrangler.jsonc file.
				"
			`);
		});

		it("should include secrets in per-environment interfaces since they are inherited", async () => {
			fs.writeFileSync(
				"./wrangler.jsonc",
				JSON.stringify({
					env: {
						staging: {
							kv_namespaces: [{ binding: "KV_STAGING", id: "staging-kv" }],
						},
					},
				}),
				"utf-8"
			);

			fs.writeFileSync("./.dev.vars", "MY_SECRET=secret-value\n", "utf-8");

			await runWrangler("types --include-runtime=false");

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Generating project types...

				declare namespace Cloudflare {
					interface StagingEnv {
						KV_STAGING: KVNamespace;
						MY_SECRET: string;
					}
					interface Env {
						MY_SECRET: string;
						KV_STAGING?: KVNamespace;
					}
				}
				interface Env extends Cloudflare.Env {}

				────────────────────────────────────────────────────────────
				✨ Types written to worker-configuration.d.ts

				📣 Remember to rerun 'wrangler types' after you change your wrangler.jsonc file.
				"
			`);
		});

		it("should produce union types for vars with different values across environments", async () => {
			fs.writeFileSync(
				"./wrangler.jsonc",
				JSON.stringify({
					vars: { DEBUG: "false" },
					env: {
						staging: {
							vars: { DEBUG: "true" },
						},
						production: {
							vars: { DEBUG: "false" },
						},
					},
				}),
				"utf-8"
			);

			await runWrangler("types --include-runtime=false");

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Generating project types...

				declare namespace Cloudflare {
					interface StagingEnv {
						DEBUG: \\"true\\";
					}
					interface ProductionEnv {
						DEBUG: \\"false\\";
					}
					interface Env {
						DEBUG: \\"true\\" | \\"false\\";
					}
				}
				interface Env extends Cloudflare.Env {}

				────────────────────────────────────────────────────────────
				✨ Types written to worker-configuration.d.ts

				📣 Remember to rerun 'wrangler types' after you change your wrangler.jsonc file.
				"
			`);
		});

		it("should generate simple Env when no environments are defined", async () => {
			fs.writeFileSync(
				"./wrangler.jsonc",
				JSON.stringify({
					kv_namespaces: [{ binding: "MY_KV", id: "kv-id" }],
					vars: { MY_VAR: "value" },
				}),
				"utf-8"
			);

			await runWrangler("types --include-runtime=false");

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Generating project types...

				declare namespace Cloudflare {
					interface Env {
						MY_KV: KVNamespace;
						MY_VAR: \\"value\\";
					}
				}
				interface Env extends Cloudflare.Env {}

				────────────────────────────────────────────────────────────
				✨ Types written to worker-configuration.d.ts

				📣 Remember to rerun 'wrangler types' after you change your wrangler.jsonc file.
				"
			`);
		});

		it("should error when environment names would collide after conversion", async () => {
			fs.writeFileSync(
				"./wrangler.jsonc",
				JSON.stringify({
					env: {
						"my-env": {
							vars: { A: "a" },
						},
						my_env: {
							vars: { B: "b" },
						},
					},
				}),
				"utf-8"
			);

			await expect(
				runWrangler("types --include-runtime=false")
			).rejects.toThrowError(
				/Environment names "my-env" and "my_env" both convert to interface name "MyEnv"/
			);
		});
	});

	describe("customization", () => {
		describe("env", () => {
			it("should allow the user to customize the interface name", async () => {
				fs.writeFileSync(
					"./wrangler.jsonc",
					JSON.stringify({
						vars: bindingsConfigMock.vars,
					}),
					"utf-8"
				);

				await runWrangler(
					"types --include-runtime=false --env-interface CloudflareEnv"
				);
				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Generating project types...

					declare namespace Cloudflare {
						interface Env {
							SOMETHING: \\"asdasdfasdf\\";
							ANOTHER: \\"thing\\";
							OBJECT_VAR: {\\"enterprise\\":\\"1701-D\\",\\"activeDuty\\":true,\\"captain\\":\\"Picard\\"};
							\\"some-other-var\\": \\"some-other-value\\";
						}
					}
					interface CloudflareEnv extends Cloudflare.Env {}

					────────────────────────────────────────────────────────────
					✨ Types written to worker-configuration.d.ts

					📣 Remember to rerun 'wrangler types' after you change your wrangler.jsonc file.
					"
				`);
			});

			it("should error if --env-interface is specified with no argument", async () => {
				fs.writeFileSync(
					"./wrangler.jsonc",
					JSON.stringify({
						vars: bindingsConfigMock.vars,
					}),
					"utf-8"
				);

				await expect(runWrangler("types --env-interface")).rejects.toThrowError(
					`Not enough arguments following: env-interface`
				);
			});

			it("should error if an invalid interface identifier is provided to --env-interface", async () => {
				fs.writeFileSync(
					"./wrangler.jsonc",
					JSON.stringify({
						vars: bindingsConfigMock.vars,
					}),
					"utf-8"
				);

				const invalidInterfaceNames = [
					"Cloudflare Env",
					"1",
					"123Env",
					"cloudflare-env",
					"env()v",
					"{}",
				];

				for (const interfaceName of invalidInterfaceNames) {
					await expect(
						runWrangler(`types --env-interface '${interfaceName}'`)
					).rejects.toThrowError(
						/The provided env-interface value .*? does not satisfy the validation regex/
					);
				}
			});

			it("should error if --env-interface is used with a service-syntax worker", async () => {
				fs.writeFileSync(
					"./index.ts",
					`addEventListener('fetch', event => {  event.respondWith(handleRequest(event.request));
				}); async function handleRequest(request) {  return new Response('Hello worker!', {headers: { 'content-type': 'text/plain' },});}`
				);
				fs.writeFileSync(
					"./wrangler.jsonc",
					JSON.stringify({
						name: "test-name",
						main: "./index.ts",
						vars: bindingsConfigMock.vars,
					}),
					"utf-8"
				);

				await expect(
					runWrangler("types --env-interface CloudflareEnv")
				).rejects.toThrowError(
					"An env-interface value has been provided but the worker uses the incompatible Service Worker syntax"
				);
			});
		});

		describe("output file", () => {
			it("should allow the user to specify where to write the result", async () => {
				fs.writeFileSync(
					"./wrangler.jsonc",
					JSON.stringify({
						compatibility_date: "2022-01-12",
						vars: bindingsConfigMock.vars,
					}),
					"utf-8"
				);

				await runWrangler("types cloudflare-env.d.ts");

				expect(fs.existsSync("./worker-configuration.d.ts")).toBe(false);

				expect(fs.readFileSync("./cloudflare-env.d.ts", "utf-8"))
					.toMatchInlineSnapshot(`
						"/* eslint-disable */
						// Generated by Wrangler by running \`wrangler\` (hash: 9dfd5cc18984b8cc3421a9e726587833)
						// Runtime types generated with workerd@
						declare namespace Cloudflare {
							interface Env {
								SOMETHING: \\"asdasdfasdf\\";
								ANOTHER: \\"thing\\";
								OBJECT_VAR: {\\"enterprise\\":\\"1701-D\\",\\"activeDuty\\":true,\\"captain\\":\\"Picard\\"};
								\\"some-other-var\\": \\"some-other-value\\";
							}
						}
						interface Env extends Cloudflare.Env {}

						// Begin runtime types
						<runtime types go here>"
					`);
			});

			it("should error if the user points to a non-d.ts file", async () => {
				fs.writeFileSync(
					"./wrangler.jsonc",
					JSON.stringify({
						vars: bindingsConfigMock.vars,
					}),
					"utf-8"
				);

				const invalidPaths = [
					"index.ts",
					"worker.js",
					"file.txt",
					"env.d",
					"env",
				];

				for (const path of invalidPaths) {
					await expect(runWrangler(`types ${path}`)).rejects.toThrowError(
						/The provided output path '.*?' does not point to a declaration file/
					);
				}
			});
		});

		it("should allow multiple customizations to be applied together", async () => {
			fs.writeFileSync(
				"./wrangler.jsonc",
				JSON.stringify({
					vars: bindingsConfigMock.vars,
				}),
				"utf-8"
			);

			await runWrangler(
				"types --env-interface MyCloudflareEnvInterface my-cloudflare-env-interface.d.ts"
			);

			expect(fs.readFileSync("./my-cloudflare-env-interface.d.ts", "utf-8"))
				.toMatchInlineSnapshot(`
					"/* eslint-disable */
					// Generated by Wrangler by running \`wrangler\` (hash: c4701684dd76f087c31740a06b0cbdb6)
					// Runtime types generated with workerd@
					declare namespace Cloudflare {
						interface Env {
							SOMETHING: \\"asdasdfasdf\\";
							ANOTHER: \\"thing\\";
							OBJECT_VAR: {\\"enterprise\\":\\"1701-D\\",\\"activeDuty\\":true,\\"captain\\":\\"Picard\\"};
							\\"some-other-var\\": \\"some-other-value\\";
						}
					}
					interface MyCloudflareEnvInterface extends Cloudflare.Env {}

					// Begin runtime types
					<runtime types go here>"
				`);
		});
	});

	describe("runtime types output", () => {
		beforeEach(() => {
			fs.writeFileSync(
				"./wrangler.jsonc",
				JSON.stringify({
					compatibility_date: "2022-12-12",
					vars: {
						"var-a": "a",
					},
				}),
				"utf-8"
			);
		});
		it("errors helpfully if you use --experimental-include-runtime", async () => {
			await expect(runWrangler("types --experimental-include-runtime")).rejects
				.toMatchInlineSnapshot(`
				[Error: You no longer need to use --experimental-include-runtime.
				\`wrangler types\` will now generate runtime types in the same file as the Env types.
				You should delete the old runtime types file, and remove it from your tsconfig.json.
				Then rerun \`wrangler types\`.]
			`);
		});
		it("prints something helpful if you have @cloudflare/workers-types", async () => {
			fs.writeFileSync(
				"./tsconfig.json",
				JSON.stringify({
					compilerOptions: { types: ["@cloudflare/workers-types"] },
				})
			);
			await runWrangler("types --include-env=false");
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Generating runtime types...

				Runtime types generated.

				────────────────────────────────────────────────────────────
				✨ Types written to worker-configuration.d.ts

				Action required Migrate from @cloudflare/workers-types to generated runtime types
				\`wrangler types\` now generates runtime types and supersedes @cloudflare/workers-types.
				You should now uninstall @cloudflare/workers-types and remove it from your tsconfig.json.

				📖 Read about runtime types
				https://developers.cloudflare.com/workers/languages/typescript/#generate-types
				📣 Remember to rerun 'wrangler types' after you change your wrangler.jsonc file.
				"
			`);
		});
		it("prints something helpful if you have a runtime file at the old default location", async () => {
			fs.writeFileSync(
				"./tsconfig.json",
				JSON.stringify({
					compilerOptions: {
						types: [
							"./wrangler/types/runtime.d.ts",
							"worker-configuration.d.ts",
						],
					},
				})
			);
			fs.mkdirSync("./.wrangler/types", { recursive: true });
			fs.writeFileSync("./.wrangler/types/runtime.d.ts", "blah");
			await runWrangler("types --include-env=false");
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Generating runtime types...

				Runtime types generated.

				────────────────────────────────────────────────────────────
				✨ Types written to worker-configuration.d.ts

				Action required Remove the old runtime.d.ts file
				\`wrangler types\` now outputs runtime and Env types in one file.
				You can now delete the ./.wrangler/types/runtime.d.ts and update your tsconfig.json\`

				📖 Read about runtime types
				https://developers.cloudflare.com/workers/languages/typescript/#generate-types
				📣 Remember to rerun 'wrangler types' after you change your wrangler.jsonc file.
				"
			`);
		});
	});

	it("should generate types for VPC services bindings", async () => {
		fs.writeFileSync(
			"./index.ts",
			`export default { async fetch(request, env) { return await env.VPC_API.fetch(request); } };`
		);
		fs.writeFileSync(
			"./wrangler.json",
			JSON.stringify({
				compatibility_date: "2022-01-12",
				name: "test-vpc-services",
				main: "./index.ts",
				vpc_services: [
					{
						binding: "VPC_API",
						service_id: "0199295b-b3ac-7760-8246-bca40877b3e9",
					},
					{
						binding: "VPC_DATABASE",
						service_id: "0299295b-b3ac-7760-8246-bca40877b3e0",
					},
				],
			}),
			"utf-8"
		);

		await runWrangler("types --include-runtime=false");
		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			Generating project types...

			declare namespace Cloudflare {
				interface GlobalProps {
					mainModule: typeof import(\\"./index\\");
				}
				interface Env {
					VPC_API: Fetcher;
					VPC_DATABASE: Fetcher;
				}
			}
			interface Env extends Cloudflare.Env {}

			────────────────────────────────────────────────────────────
			✨ Types written to worker-configuration.d.ts

			📣 Remember to rerun 'wrangler types' after you change your wrangler.json file.
			"
		`);
	});
});
