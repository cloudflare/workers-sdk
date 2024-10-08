import * as fs from "fs";
import * as TOML from "@iarna/toml";
import {
	constructTSModuleGlob,
	constructType,
	constructTypeKey,
	generateImportSpecifier,
	isValidIdentifier,
} from "../type-generation";
import { dedent } from "../utils/dedent";
import { mockConsoleMethods } from "./helpers/mock-console";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import type { EnvironmentNonInheritable } from "../config/environment";

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

describe("constructType", () => {
	it("should return a valid type", () => {
		expect(constructType("valid", "string")).toBe("valid: string;");
		expect(constructType("valid123", "string")).toBe("valid123: string;");
		expect(constructType("valid_123", "string")).toBe("valid_123: string;");
		expect(constructType("valid_123_", "string")).toBe("valid_123_: string;");
		expect(constructType("_valid_123_", "string")).toBe("_valid_123_: string;");
		expect(constructType("_valid_123_", "string")).toBe("_valid_123_: string;");

		expect(constructType("123invalid", "string")).toBe('"123invalid": string;');
		expect(constructType("invalid-123", "string")).toBe(
			'"invalid-123": string;'
		);
		expect(constructType("invalid 123", "string")).toBe(
			'"invalid 123": string;'
		);

		expect(constructType("valid", 'a"', false)).toBe('valid: "a\\"";');
		expect(constructType("valid", "a\\", false)).toBe('valid: "a\\\\";');
		expect(constructType("valid", "a\\b", false)).toBe('valid: "a\\\\b";');
		expect(constructType("valid", 'a\\b"', false)).toBe('valid: "a\\\\b\\"";');

		expect(constructType("valid", 1)).toBe("valid: 1;");
		expect(constructType("valid", 12345)).toBe("valid: 12345;");
		expect(constructType("valid", true)).toBe("valid: true;");
		expect(constructType("valid", false)).toBe("valid: false;");
	});
});

describe("constructType with multiline strings", () => {
	it("should correctly escape newlines in string values", () => {
		const multilineString = "This is a\nmulti-line\nstring";
		const expected = `valid: "This is a\\nmulti-line\\nstring";`;
		expect(constructType("valid", multilineString, false)).toBe(expected);
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
	pipelines: [],
	assets: {
		binding: "ASSETS_BINDING",
		directory: "/assets",
	},
};

describe("generateTypes()", () => {
	const std = mockConsoleMethods();
	runInTempDir();

	it("should show a warning when no config file is detected", async () => {
		await runWrangler("types");
		expect(std.warn).toMatchInlineSnapshot(`
		"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mNo config file detected, aborting[0m

		"
	`);
	});

	it("should show a warning when no custom config file is detected", async () => {
		await runWrangler("types -c hello.toml");
		expect(std.warn).toMatchInlineSnapshot(`
		"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mNo config file detected (at hello.toml), aborting[0m

		"
	`);
	});

	it("should respect the top level -c|--config flag", async () => {
		fs.writeFileSync(
			"./wrangler.toml",
			TOML.stringify({
				vars: {
					var: "from wrangler toml",
				},
			} as TOML.JsonMap),
			"utf-8"
		);

		fs.writeFileSync(
			"./my-wrangler-config-a.toml",
			TOML.stringify({
				vars: {
					var: "from my-wrangler-config-a",
				},
			} as TOML.JsonMap),
			"utf-8"
		);

		fs.writeFileSync(
			"./my-wrangler-config-b.toml",
			TOML.stringify({
				vars: {
					var: "from my-wrangler-config-b",
				},
			} as TOML.JsonMap),
			"utf-8"
		);

		await runWrangler("types");
		await runWrangler("types --config ./my-wrangler-config-a.toml");
		await runWrangler("types -c my-wrangler-config-b.toml");

		expect(std.out).toMatchInlineSnapshot(`
		"Generating project types...

		interface Env {
			var: \\"from wrangler toml\\";
		}

		Generating project types...

		interface Env {
			var: \\"from my-wrangler-config-a\\";
		}

		Generating project types...

		interface Env {
			var: \\"from my-wrangler-config-b\\";
		}
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

		await runWrangler("types");
		expect(std.out).toMatchInlineSnapshot(`
		"Generating project types...

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
			VERSION_METADATA_BINDING: { id: string; tag: string };
			ASSETS_BINDING: Fetcher;
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
		}"
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
	});

	describe("when nothing was found", () => {
		it("should not create DTS file for service syntax workers", async () => {
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
			expect(fs.existsSync("./worker-configuration.d.ts")).toBe(false);
			expect(std.out).toMatchInlineSnapshot(`""`);
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

			await runWrangler("types");

			expect(fs.readFileSync("./worker-configuration.d.ts", "utf-8")).toContain(
				`// eslint-disable-next-line @typescript-eslint/no-empty-interface,@typescript-eslint/no-empty-object-type\ninterface Env {\n}`
			);
			expect(std.out).toMatchInlineSnapshot(`
			"Generating project types...

			interface Env {
			}
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
			`[Error: A non-wrangler worker-configuration.d.ts already exists, please rename and try again.]`
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

		await runWrangler("types");
		expect(std.out).toMatchInlineSnapshot(`
		"Generating project types...

		export {};
		declare global {
			const testing_unsafe: any;
			const UNSAFE_RATELIMIT: RateLimit;
		}
		"
	`);
	});

	it("should accept a toml file without an entrypoint and fallback to the standard modules declarations", async () => {
		fs.writeFileSync(
			"./wrangler.toml",
			TOML.stringify({
				vars: bindingsConfigMock.vars,
			} as unknown as TOML.JsonMap),
			"utf-8"
		);

		await runWrangler("types");
		expect(std.out).toMatchInlineSnapshot(`
		"Generating project types...

		interface Env {
			SOMETHING: \\"asdasdfasdf\\";
			ANOTHER: \\"thing\\";
			\\"some-other-var\\": \\"some-other-value\\";
			OBJECT_VAR: {\\"enterprise\\":\\"1701-D\\",\\"activeDuty\\":true,\\"captian\\":\\"Picard\\"};
		}
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

		await runWrangler("types");

		expect(std.out).toMatchInlineSnapshot(`
		"Generating project types...

		interface Env {
			myTomlVarA: \\"A from wrangler toml\\";
			myTomlVarB: \\"B from wrangler toml\\";
			SECRET_A: string;
			MULTI_LINE_SECRET: string;
			UNQUOTED_SECRET: string;
		}
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

		await runWrangler("types");

		expect(std.out).toMatchInlineSnapshot(`
		"Generating project types...

		interface Env {
			MY_VARIABLE_A: string;
			MY_VARIABLE_B: string;
		}
		"
	`);
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

				await runWrangler("types --env-interface CloudflareEnv");
				expect(std.out).toMatchInlineSnapshot(`
			"Generating project types...

			interface CloudflareEnv {
				SOMETHING: \\"asdasdfasdf\\";
				ANOTHER: \\"thing\\";
				\\"some-other-var\\": \\"some-other-value\\";
				OBJECT_VAR: {\\"enterprise\\":\\"1701-D\\",\\"activeDuty\\":true,\\"captian\\":\\"Picard\\"};
			}
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

			it("should warn if --env-interface is used with a service-syntax worker", async () => {
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
						vars: bindingsConfigMock.vars,
					} as TOML.JsonMap),
					"utf-8"
				);

				await runWrangler("types cloudflare-env.d.ts");

				expect(fs.existsSync("./worker-configuration.d.ts")).toBe(false);

				expect(fs.readFileSync("./cloudflare-env.d.ts", "utf-8")).toMatch(
					/interface Env \{[\s\S]*SOMETHING: "asdasdfasdf";[\s\S]*ANOTHER: "thing";[\s\S]*"some-other-var": "some-other-value";[\s\S]*OBJECT_VAR: \{"enterprise":"1701-D","activeDuty":true,"captian":"Picard"\};[\s\S]*}/
				);
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
						/The provided path value .*? does not point to a declaration file/
					);
				}
			});
		});

		it("should allow multiple customization to be applied together", async () => {
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

			expect(
				fs.readFileSync("./my-cloudflare-env-interface.d.ts", "utf-8")
			).toMatch(
				/interface MyCloudflareEnvInterface \{[\s\S]*SOMETHING: "asdasdfasdf";[\s\S]*ANOTHER: "thing";[\s\S]*"some-other-var": "some-other-value";[\s\S]*OBJECT_VAR: \{"enterprise":"1701-D","activeDuty":true,"captian":"Picard"\};[\s\S]*}/
			);
		});
	});
});
