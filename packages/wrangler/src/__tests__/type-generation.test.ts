import * as fs from "fs";
import * as TOML from "@iarna/toml";
import {
	constructTSModuleGlob,
	constructTypeKey,
	generateImportSpecifier,
	isValidIdentifier,
} from "../type-generation";
import * as generateRuntime from "../type-generation/runtime";
import { dedent } from "../utils/dedent";
import { mockConsoleMethods } from "./helpers/mock-console";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import type { EnvironmentNonInheritable } from "../config/environment";
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
			captian: "Picard",
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
				name: "DURABLE_EXTERNAL",
				class_name: "DurableExternal",
				script_name: "external-worker",
			},
		],
	},
	workflows: [],
	containers: undefined,
	r2_buckets: [
		{
			binding: "R2_BUCKET_BINDING",
			bucket_name: "R2BUCKET_NAME_TEST",
		},
	],
	d1_databases: [
		{
			binding: "D1_TESTING_SOMETHING",
			database_name: "D1_BINDING",
			database_id: "1234",
		},
	],
	services: [{ binding: "SERVICE_BINDING", service: "SERVICE_NAME" }],
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
			"./wrangler.toml",
			TOML.stringify({
				compatibility_date: "2022-01-12",
				compatibility_flags: ["fake-compat-1"],
				vars: {
					var: "from wrangler toml",
				},
			} as TOML.JsonMap),
			"utf-8"
		);

		fs.writeFileSync(
			"./my-wrangler-config-a.toml",
			TOML.stringify({
				compatibility_date: "2023-01-12",
				compatibility_flags: ["fake-compat-2"],
				vars: {
					var: "from my-wrangler-config-a",
				},
			} as TOML.JsonMap),
			"utf-8"
		);

		fs.writeFileSync(
			"./my-wrangler-config-b.toml",
			TOML.stringify({
				compatibility_date: "2024-01-12",
				compatibility_flags: ["fake-compat-3"],
				vars: {
					var: "from my-wrangler-config-b",
				},
			} as TOML.JsonMap),
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

		await runWrangler("types --config ./my-wrangler-config-a.toml");
		expect(spy).toHaveBeenNthCalledWith(2, {
			config: expect.objectContaining({
				compatibility_date: "2023-01-12",
				compatibility_flags: ["fake-compat-2"],
			}),
			outFile: "worker-configuration.d.ts",
		});

		await runWrangler("types -c my-wrangler-config-b.toml");
		expect(spy).toHaveBeenNthCalledWith(3, {
			config: expect.objectContaining({
				compatibility_date: "2024-01-12",
				compatibility_flags: ["fake-compat-3"],
			}),
			outFile: "worker-configuration.d.ts",
		});
		expect(std.out).toMatchInlineSnapshot(`
			"Generating project types...

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
			📣 Remember to rerun 'wrangler types' after you change your wrangler.toml file.

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
			📣 Remember to rerun 'wrangler types' after you change your wrangler.toml file.

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
			📣 Remember to rerun 'wrangler types' after you change your wrangler.toml file.
			"
		`);
	});

	it("should log the interface type generated and declare modules", async () => {
		fs.writeFileSync(
			"./index.ts",
			`import { DurableObject } from 'cloudflare:workers';
				export default { async fetch () {} };
				export class DurableDirect extends DurableObject {}
				export { DurableReexport } from './durable-2.js';
				// This should not be picked up, because it's external:
				export class DurableExternal extends DurableObject {}`
		);
		fs.writeFileSync(
			"./wrangler.toml",
			TOML.stringify({
				compatibility_date: "2022-01-12",
				name: "test-name",
				main: "./index.ts",
				...bindingsConfigMock,
				unsafe: bindingsConfigMock.unsafe ?? {},
			} as unknown as TOML.JsonMap),
			"utf-8"
		);

		await runWrangler("types --include-runtime=false");
		expect(std.out).toMatchInlineSnapshot(`
			"Generating project types...

			declare namespace Cloudflare {
				interface Env {
					TEST_KV_NAMESPACE: KVNamespace;
					SOMETHING: \\"asdasdfasdf\\";
					ANOTHER: \\"thing\\";
					\\"some-other-var\\": \\"some-other-value\\";
					OBJECT_VAR: {\\"enterprise\\":\\"1701-D\\",\\"activeDuty\\":true,\\"captian\\":\\"Picard\\"};
					DURABLE_DIRECT_EXPORT: DurableObjectNamespace<import(\\"./index\\").DurableDirect>;
					DURABLE_RE_EXPORT: DurableObjectNamespace<import(\\"./index\\").DurableReexport>;
					DURABLE_NO_EXPORT: DurableObjectNamespace /* DurableNoexport */;
					DURABLE_EXTERNAL: DurableObjectNamespace /* DurableExternal from external-worker */;
					R2_BUCKET_BINDING: R2Bucket;
					D1_TESTING_SOMETHING: D1Database;
					SERVICE_BINDING: Fetcher;
					AE_DATASET_BINDING: AnalyticsEngineDataset;
					NAMESPACE_BINDING: DispatchNamespace;
					LOGFWDR_SCHEMA: any;
					SOME_DATA_BLOB1: ArrayBuffer;
					SOME_DATA_BLOB2: ArrayBuffer;
					SOME_TEXT_BLOB1: string;
					SOME_TEXT_BLOB2: string;
					testing_unsafe: any;
					UNSAFE_RATELIMIT: RateLimit;
					TEST_QUEUE_BINDING: Queue;
					SEND_EMAIL_BINDING: SendEmail;
					VECTORIZE_BINDING: VectorizeIndex;
					HYPERDRIVE_BINDING: Hyperdrive;
					MTLS_BINDING: Fetcher;
					BROWSER_BINDING: Fetcher;
					AI_BINDING: Ai;
					IMAGES_BINDING: ImagesBinding;
					VERSION_METADATA_BINDING: { id: string; tag: string };
					ASSETS_BINDING: Fetcher;
					PIPELINE: import(\\"cloudflare:pipelines\\").Pipeline<import(\\"cloudflare:pipelines\\").PipelineRecord>;
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

			📣 Remember to rerun 'wrangler types' after you change your wrangler.toml file.
			"
		`);
	});

	it("should include stringified process.env types for vars, secrets, and json", async () => {
		fs.writeFileSync(
			"./index.ts",
			`import { DurableObject } from 'cloudflare:workers';
				export default { async fetch () {} };
				export class DurableDirect extends DurableObject {}
				export { DurableReexport } from './durable-2.js';
				// This should not be picked up, because it's external:
				export class DurableExternal extends DurableObject {}`
		);
		fs.writeFileSync(
			"./wrangler.toml",
			TOML.stringify({
				compatibility_date: "2022-01-12",
				compatibility_flags: [
					"nodejs_compat",
					"nodejs_compat_populate_process_env",
				],
				name: "test-name",
				main: "./index.ts",
				...bindingsConfigMock,
				unsafe: bindingsConfigMock.unsafe ?? {},
			} as unknown as TOML.JsonMap),
			"utf-8"
		);
		fs.writeFileSync("./.dev.vars", "SECRET=test", "utf-8");

		await runWrangler("types --include-runtime=false");
		expect(std.out).toMatchInlineSnapshot(`
			"Generating project types...

			declare namespace Cloudflare {
				interface Env {
					TEST_KV_NAMESPACE: KVNamespace;
					SOMETHING: \\"asdasdfasdf\\";
					ANOTHER: \\"thing\\";
					\\"some-other-var\\": \\"some-other-value\\";
					OBJECT_VAR: {\\"enterprise\\":\\"1701-D\\",\\"activeDuty\\":true,\\"captian\\":\\"Picard\\"};
					SECRET: string;
					DURABLE_DIRECT_EXPORT: DurableObjectNamespace<import(\\"./index\\").DurableDirect>;
					DURABLE_RE_EXPORT: DurableObjectNamespace<import(\\"./index\\").DurableReexport>;
					DURABLE_NO_EXPORT: DurableObjectNamespace /* DurableNoexport */;
					DURABLE_EXTERNAL: DurableObjectNamespace /* DurableExternal from external-worker */;
					R2_BUCKET_BINDING: R2Bucket;
					D1_TESTING_SOMETHING: D1Database;
					SERVICE_BINDING: Fetcher;
					AE_DATASET_BINDING: AnalyticsEngineDataset;
					NAMESPACE_BINDING: DispatchNamespace;
					LOGFWDR_SCHEMA: any;
					SOME_DATA_BLOB1: ArrayBuffer;
					SOME_DATA_BLOB2: ArrayBuffer;
					SOME_TEXT_BLOB1: string;
					SOME_TEXT_BLOB2: string;
					testing_unsafe: any;
					UNSAFE_RATELIMIT: RateLimit;
					TEST_QUEUE_BINDING: Queue;
					SEND_EMAIL_BINDING: SendEmail;
					VECTORIZE_BINDING: VectorizeIndex;
					HYPERDRIVE_BINDING: Hyperdrive;
					MTLS_BINDING: Fetcher;
					BROWSER_BINDING: Fetcher;
					AI_BINDING: Ai;
					IMAGES_BINDING: ImagesBinding;
					VERSION_METADATA_BINDING: { id: string; tag: string };
					ASSETS_BINDING: Fetcher;
					PIPELINE: import(\\"cloudflare:pipelines\\").Pipeline<import(\\"cloudflare:pipelines\\").PipelineRecord>;
				}
			}
			interface Env extends Cloudflare.Env {}
			type StringifyValues<EnvType extends Record<string, unknown>> = {
				[Binding in keyof EnvType]: EnvType[Binding] extends string ? EnvType[Binding] : string;
			};
			declare namespace NodeJS {
				interface ProcessEnv extends StringifyValues<Pick<Cloudflare.Env, \\"SOMETHING\\" | \\"ANOTHER\\" | \\"some-other-var\\" | \\"OBJECT_VAR\\" | \\"SECRET\\">> {}
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

			📣 Remember to rerun 'wrangler types' after you change your wrangler.toml file.
			"
		`);
	});

	it("should create a DTS file at the location that the command is executed from", async () => {
		fs.writeFileSync("./index.ts", "export default { async fetch () {} };");
		fs.writeFileSync(
			"./wrangler.toml",
			TOML.stringify({
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
				"// Generated by Wrangler by running \`wrangler\` (hash: a123396658ac84465faf6f0f82c0337b)
				// Runtime types generated with workerd@
				declare namespace Cloudflare {
					interface Env {
						SOMETHING: \\"asdasdfasdf\\";
						ANOTHER: \\"thing\\";
						\\"some-other-var\\": \\"some-other-value\\";
						OBJECT_VAR: {\\"enterprise\\":\\"1701-D\\",\\"activeDuty\\":true,\\"captian\\":\\"Picard\\"};
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
				"./wrangler.toml",
				TOML.stringify({
					compatibility_date: "2022-01-12",
					name: "test-name",
					main: "./index.ts",
				}),
				"utf-8"
			);

			await runWrangler("types --include-runtime=false");
			expect(fs.existsSync("./worker-configuration.d.ts")).toBe(false);
			expect(std.out).toMatchInlineSnapshot(`
				"Generating project types...

				No project types to add.

				────────────────────────────────────────────────────────────
				📣 Remember to rerun 'wrangler types' after you change your wrangler.toml file.
				"
			`);
		});

		it("should create DTS file for service syntax workers with runtime types only", async () => {
			fs.writeFileSync(
				"./index.ts",
				'addEventListener("fetch", event => { event.respondWith(() => new Response("")); })'
			);
			fs.writeFileSync(
				"./wrangler.toml",
				TOML.stringify({
					compatibility_date: "2022-01-12",
					name: "test-name",
					main: "./index.ts",
				}),
				"utf-8"
			);

			await runWrangler("types");
			expect(fs.readFileSync("./worker-configuration.d.ts", "utf8"))
				.toMatchInlineSnapshot(`
					"// Runtime types generated with workerd@
					// Begin runtime types
					<runtime types go here>"
				`);
			expect(std.out).toMatchInlineSnapshot(`
				"Generating project types...

				No project types to add.

				Generating runtime types...

				Runtime types generated.

				────────────────────────────────────────────────────────────
				✨ Types written to worker-configuration.d.ts

				📖 Read about runtime types
				https://developers.cloudflare.com/workers/languages/typescript/#generate-types
				📣 Remember to rerun 'wrangler types' after you change your wrangler.toml file.
				"
			`);
		});

		it("should create a DTS file with an empty env interface for module syntax workers", async () => {
			fs.writeFileSync("./index.ts", "export default { async fetch () {} };");
			fs.writeFileSync(
				"./wrangler.toml",
				TOML.stringify({
					compatibility_date: "2022-01-12",
					name: "test-name",
					main: "./index.ts",
				}),
				"utf-8"
			);

			await runWrangler("types --include-runtime=false");

			expect(fs.readFileSync("./worker-configuration.d.ts", "utf-8")).toContain(
				`\t// eslint-disable-next-line @typescript-eslint/no-empty-interface,@typescript-eslint/no-empty-object-type\n\tinterface Env {\n\t}`
			);
			expect(std.out).toMatchInlineSnapshot(`
				"Generating project types...

				declare namespace Cloudflare {
					// eslint-disable-next-line @typescript-eslint/no-empty-interface,@typescript-eslint/no-empty-object-type
					interface Env {
					}
				}
				interface Env extends Cloudflare.Env {}

				────────────────────────────────────────────────────────────
				✨ Types written to worker-configuration.d.ts

				📣 Remember to rerun 'wrangler types' after you change your wrangler.toml file.
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
			"./wrangler.toml",
			TOML.stringify({
				compatibility_date: "2022-01-12",
				name: "test-name",
				main: "./index.ts",
				vars: bindingsConfigMock.vars,
			} as TOML.JsonMap),
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
			"./wrangler.toml",
			TOML.stringify({
				compatibility_date: "2022-01-12",
				name: "test-name",
				main: "./index.ts",
				unsafe: bindingsConfigMock.unsafe
					? {
							bindings: bindingsConfigMock.unsafe.bindings,
							metadata: bindingsConfigMock.unsafe.metadata,
						}
					: undefined,
			} as TOML.JsonMap),
			"utf-8"
		);

		await runWrangler("types --include-runtime=false");
		expect(std.out).toMatchInlineSnapshot(`
			"Generating project types...

			export {};
			declare global {
				const testing_unsafe: any;
				const UNSAFE_RATELIMIT: RateLimit;
			}

			────────────────────────────────────────────────────────────
			✨ Types written to worker-configuration.d.ts

			📣 Remember to rerun 'wrangler types' after you change your wrangler.toml file.
			"
		`);
	});

	it("should accept a toml file without an entrypoint and fallback to the standard modules declarations", async () => {
		fs.writeFileSync(
			"./wrangler.toml",
			TOML.stringify({
				compatibility_date: "2022-01-12",
				vars: bindingsConfigMock.vars,
			} as unknown as TOML.JsonMap),
			"utf-8"
		);

		await runWrangler("types");
		expect(std.out).toMatchInlineSnapshot(`
			"Generating project types...

			declare namespace Cloudflare {
				interface Env {
					SOMETHING: \\"asdasdfasdf\\";
					ANOTHER: \\"thing\\";
					\\"some-other-var\\": \\"some-other-value\\";
					OBJECT_VAR: {\\"enterprise\\":\\"1701-D\\",\\"activeDuty\\":true,\\"captian\\":\\"Picard\\"};
				}
			}
			interface Env extends Cloudflare.Env {}

			Generating runtime types...

			Runtime types generated.

			────────────────────────────────────────────────────────────
			✨ Types written to worker-configuration.d.ts

			📖 Read about runtime types
			https://developers.cloudflare.com/workers/languages/typescript/#generate-types
			📣 Remember to rerun 'wrangler types' after you change your wrangler.toml file.
			"
		`);
	});

	it("should not error if expected entrypoint is not found and assume module worker", async () => {
		fs.writeFileSync(
			"./wrangler.toml",
			TOML.stringify({
				main: "index.ts",
				vars: bindingsConfigMock.vars,
			} as unknown as TOML.JsonMap),
			"utf-8"
		);
		expect(fs.existsSync("index.ts")).toEqual(false);

		await runWrangler("types --include-runtime=false");
		expect(std.out).toMatchInlineSnapshot(`
			"Generating project types...

			declare namespace Cloudflare {
				interface Env {
					SOMETHING: \\"asdasdfasdf\\";
					ANOTHER: \\"thing\\";
					\\"some-other-var\\": \\"some-other-value\\";
					OBJECT_VAR: {\\"enterprise\\":\\"1701-D\\",\\"activeDuty\\":true,\\"captian\\":\\"Picard\\"};
				}
			}
			interface Env extends Cloudflare.Env {}

			────────────────────────────────────────────────────────────
			✨ Types written to worker-configuration.d.ts

			📣 Remember to rerun 'wrangler types' after you change your wrangler.toml file.
			"
		`);
	});

	it("should include secret keys from .dev.vars", async () => {
		fs.writeFileSync(
			"./wrangler.toml",
			TOML.stringify({
				vars: {
					myTomlVarA: "A from wrangler toml",
					myTomlVarB: "B from wrangler toml",
				},
			} as TOML.JsonMap),
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

		await runWrangler("types --include-runtime=false");

		expect(std.out).toMatchInlineSnapshot(`
			"Generating project types...

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

			📣 Remember to rerun 'wrangler types' after you change your wrangler.toml file.
			"
		`);
	});

	it("should allow opting out of strict-vars", async () => {
		fs.writeFileSync(
			"./wrangler.toml",
			TOML.stringify({
				vars: {
					varStr: "A from wrangler toml",
					varArrNum: [1, 2, 3],
					varArrMix: [1, "two", 3, true],
					varObj: { test: true },
				},
			} as TOML.JsonMap),
			"utf-8"
		);

		await runWrangler("types --strict-vars=false --include-runtime=false");

		expect(std.out).toMatchInlineSnapshot(`
			"Generating project types...

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

			📣 Remember to rerun 'wrangler types' after you change your wrangler.toml file.
			"
		`);
	});

	it("should override vars with secrets", async () => {
		fs.writeFileSync(
			"./wrangler.toml",
			TOML.stringify({
				vars: {
					MY_VARIABLE_A: "my variable",
					MY_VARIABLE_B: { variable: true },
				},
			} as TOML.JsonMap),
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
			"Generating project types...

			declare namespace Cloudflare {
				interface Env {
					MY_VARIABLE_A: string;
					MY_VARIABLE_B: string;
				}
			}
			interface Env extends Cloudflare.Env {}

			────────────────────────────────────────────────────────────
			✨ Types written to worker-configuration.d.ts

			📣 Remember to rerun 'wrangler types' after you change your wrangler.toml file.
			"
		`);
	});

	it("various different types of vars", async () => {
		fs.writeFileSync(
			"./wrangler.toml",
			TOML.stringify({
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
			} as TOML.JsonMap),
			"utf-8"
		);
		await runWrangler("types --include-runtime=false");

		expect(std.out).toMatchInlineSnapshot(`
			"Generating project types...

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

			📣 Remember to rerun 'wrangler types' after you change your wrangler.toml file.
			"
		`);
	});

	describe("vars present in multiple environments", () => {
		beforeEach(() => {
			fs.writeFileSync(
				"./wrangler.toml",
				TOML.stringify({
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
				} as TOML.JsonMap),
				"utf-8"
			);
		});

		it("should produce string and union types for variables (default)", async () => {
			await runWrangler("types --include-runtime=false");

			expect(std.out).toMatchInlineSnapshot(`
				"Generating project types...

				declare namespace Cloudflare {
					interface Env {
						MY_VAR: \\"a var\\";
						MY_VAR_A: \\"A (dev)\\" | \\"A (prod)\\" | \\"A (stag)\\";
						MY_VAR_C: [\\"a\\",\\"b\\",\\"c\\"] | [1,2,3];
						MY_VAR_B: {\\"value\\":\\"B (dev)\\"} | {\\"value\\":\\"B (prod)\\"};
					}
				}
				interface Env extends Cloudflare.Env {}

				────────────────────────────────────────────────────────────
				✨ Types written to worker-configuration.d.ts

				📣 Remember to rerun 'wrangler types' after you change your wrangler.toml file.
				"
			`);
		});

		it("should produce non-strict types for variables (with --strict-vars=false)", async () => {
			await runWrangler("types --strict-vars=false --include-runtime=false");

			expect(std.out).toMatchInlineSnapshot(`
				"Generating project types...

				declare namespace Cloudflare {
					interface Env {
						MY_VAR: string;
						MY_VAR_A: string;
						MY_VAR_C: string[] | number[];
						MY_VAR_B: object;
					}
				}
				interface Env extends Cloudflare.Env {}

				────────────────────────────────────────────────────────────
				✨ Types written to worker-configuration.d.ts

				📣 Remember to rerun 'wrangler types' after you change your wrangler.toml file.
				"
			`);
		});
	});

	describe("customization", () => {
		describe("env", () => {
			it("should allow the user to customize the interface name", async () => {
				fs.writeFileSync(
					"./wrangler.toml",
					TOML.stringify({
						vars: bindingsConfigMock.vars,
					} as TOML.JsonMap),
					"utf-8"
				);

				await runWrangler(
					"types --include-runtime=false --env-interface CloudflareEnv"
				);
				expect(std.out).toMatchInlineSnapshot(`
					"Generating project types...

					declare namespace Cloudflare {
						interface Env {
							SOMETHING: \\"asdasdfasdf\\";
							ANOTHER: \\"thing\\";
							\\"some-other-var\\": \\"some-other-value\\";
							OBJECT_VAR: {\\"enterprise\\":\\"1701-D\\",\\"activeDuty\\":true,\\"captian\\":\\"Picard\\"};
						}
					}
					interface CloudflareEnv extends Cloudflare.Env {}

					────────────────────────────────────────────────────────────
					✨ Types written to worker-configuration.d.ts

					📣 Remember to rerun 'wrangler types' after you change your wrangler.toml file.
					"
				`);
			});

			it("should error if --env-interface is specified with no argument", async () => {
				fs.writeFileSync(
					"./wrangler.toml",
					TOML.stringify({
						vars: bindingsConfigMock.vars,
					} as TOML.JsonMap),
					"utf-8"
				);

				await expect(runWrangler("types --env-interface")).rejects.toThrowError(
					`Not enough arguments following: env-interface`
				);
			});

			it("should error if an invalid interface identifier is provided to --env-interface", async () => {
				fs.writeFileSync(
					"./wrangler.toml",
					TOML.stringify({
						vars: bindingsConfigMock.vars,
					} as TOML.JsonMap),
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
					"./wrangler.toml",
					TOML.stringify({
						name: "test-name",
						main: "./index.ts",
						vars: bindingsConfigMock.vars,
					} as TOML.JsonMap),
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
					"./wrangler.toml",
					TOML.stringify({
						compatibility_date: "2022-01-12",
						vars: bindingsConfigMock.vars,
					} as TOML.JsonMap),
					"utf-8"
				);

				await runWrangler("types cloudflare-env.d.ts");

				expect(fs.existsSync("./worker-configuration.d.ts")).toBe(false);

				expect(fs.readFileSync("./cloudflare-env.d.ts", "utf-8"))
					.toMatchInlineSnapshot(`
						"// Generated by Wrangler by running \`wrangler\` (hash: a123396658ac84465faf6f0f82c0337b)
						// Runtime types generated with workerd@
						declare namespace Cloudflare {
							interface Env {
								SOMETHING: \\"asdasdfasdf\\";
								ANOTHER: \\"thing\\";
								\\"some-other-var\\": \\"some-other-value\\";
								OBJECT_VAR: {\\"enterprise\\":\\"1701-D\\",\\"activeDuty\\":true,\\"captian\\":\\"Picard\\"};
							}
						}
						interface Env extends Cloudflare.Env {}

						// Begin runtime types
						<runtime types go here>"
					`);
			});

			it("should error if the user points to a non-d.ts file", async () => {
				fs.writeFileSync(
					"./wrangler.toml",
					TOML.stringify({
						vars: bindingsConfigMock.vars,
					} as TOML.JsonMap),
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
				"./wrangler.toml",
				TOML.stringify({
					vars: bindingsConfigMock.vars,
				} as TOML.JsonMap),
				"utf-8"
			);

			await runWrangler(
				"types --env-interface MyCloudflareEnvInterface my-cloudflare-env-interface.d.ts"
			);

			expect(fs.readFileSync("./my-cloudflare-env-interface.d.ts", "utf-8"))
				.toMatchInlineSnapshot(`
					"// Generated by Wrangler by running \`wrangler\` (hash: 7e48a0a15b531f54ca31c564fe6cb101)
					// Runtime types generated with workerd@
					declare namespace Cloudflare {
						interface Env {
							SOMETHING: \\"asdasdfasdf\\";
							ANOTHER: \\"thing\\";
							\\"some-other-var\\": \\"some-other-value\\";
							OBJECT_VAR: {\\"enterprise\\":\\"1701-D\\",\\"activeDuty\\":true,\\"captian\\":\\"Picard\\"};
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
				"./wrangler.toml",
				TOML.stringify({
					compatibility_date: "2022-12-12",
					vars: {
						"var-a": "a",
					},
				} as TOML.JsonMap),
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
				"Generating runtime types...

				Runtime types generated.

				────────────────────────────────────────────────────────────
				✨ Types written to worker-configuration.d.ts

				Action required Migrate from @cloudflare/workers-types to generated runtime types
				\`wrangler types\` now generates runtime types and supersedes @cloudflare/workers-types.
				You should now uninstall @cloudflare/workers-types and remove it from your tsconfig.json.

				📖 Read about runtime types
				https://developers.cloudflare.com/workers/languages/typescript/#generate-types
				📣 Remember to rerun 'wrangler types' after you change your wrangler.toml file.
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
				"Generating runtime types...

				Runtime types generated.

				────────────────────────────────────────────────────────────
				✨ Types written to worker-configuration.d.ts

				Action required Remove the old runtime.d.ts file
				\`wrangler types\` now outputs runtime and Env types in one file.
				You can now delete the ./.wrangler/types/runtime.d.ts and update your tsconfig.json\`

				📖 Read about runtime types
				https://developers.cloudflare.com/workers/languages/typescript/#generate-types
				📣 Remember to rerun 'wrangler types' after you change your wrangler.toml file.
				"
			`);
		});
	});
});
