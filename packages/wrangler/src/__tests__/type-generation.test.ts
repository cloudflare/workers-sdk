import * as fs from "fs";
import * as TOML from "@iarna/toml";
import { dedent } from "../utils/dedent";
import { mockConsoleMethods } from "./helpers/mock-console";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import type { Config } from "../config";

const bindingsConfigMock: Partial<Config> = {
	kv_namespaces: [{ binding: "TEST_KV_NAMESPACE", id: "1234" }],
	vars: {
		SOMETHING: "asdasdfasdf",
		ANOTHER: "thing",
		OBJECT_VAR: {
			enterprise: "1701-D",
			activeDuty: true,
			captian: "Picard",
		}, // We can assume the objects will be stringified
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
			{ name: "DURABLE_TEST1", class_name: "Durability1" },
			{ name: "DURABLE_TEST2", class_name: "Durability2" },
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
		bindings: [{ name: "testing_unsafe", type: "plain_text" }],
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
		"interface Env {
			var: \\"from wrangler toml\\";
		}

		interface Env {
			var: \\"from my-wrangler-config-a\\";
		}

		interface Env {
			var: \\"from my-wrangler-config-b\\";
		}
		"
	`);
	});

	it("should log the interface type generated and declare modules", async () => {
		fs.writeFileSync("./index.ts", "export default { async fetch () {} };");
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
		"interface Env {
			TEST_KV_NAMESPACE: KVNamespace;
			SOMETHING: \\"asdasdfasdf\\";
			ANOTHER: \\"thing\\";
			OBJECT_VAR: {\\"enterprise\\":\\"1701-D\\",\\"activeDuty\\":true,\\"captian\\":\\"Picard\\"};
			DURABLE_TEST1: DurableObjectNamespace;
			DURABLE_TEST2: DurableObjectNamespace;
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
			TEST_QUEUE_BINDING: Queue;
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

	it("should not create DTS file if there is nothing in the config to generate types from", async () => {
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
		expect(fs.existsSync("./worker-configuration.d.ts")).toBe(false);
		expect(std.out).toMatchInlineSnapshot(`""`);
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
		"export {};
		declare global {
			const testing_unsafe: any;
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
		"interface Env {
			SOMETHING: \\"asdasdfasdf\\";
			ANOTHER: \\"thing\\";
			OBJECT_VAR: {\\"enterprise\\":\\"1701-D\\",\\"activeDuty\\":true,\\"captian\\":\\"Picard\\"};
		}
		"
	`);
	});

	it("should include secrets from .dev.vars", async () => {
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
		"interface Env {
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
					MY_VARIABLE: "my variable",
				},
			} as TOML.JsonMap),
			"utf-8"
		);

		const localVarsEnvContent = dedent`
		# Preceding comment
		MY_VARIABLE = "my secret"
		`;
		fs.writeFileSync(".dev.vars", localVarsEnvContent, "utf8");

		await runWrangler("types");

		expect(std.out).toMatchInlineSnapshot(`
		"interface Env {
			MY_VARIABLE: string;
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
			"interface CloudflareEnv {
				SOMETHING: \\"asdasdfasdf\\";
				ANOTHER: \\"thing\\";
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

				await runWrangler("types --env-interface CloudflareEnv");

				expect(std.warn).toMatchInlineSnapshot(`
			"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mIgnoring the provided env-interface value as it only applies to ES Module syntax workers[0m

			"
		`);
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
					/interface Env \{[\s\S]*SOMETHING: "asdasdfasdf";[\s\S]*ANOTHER: "thing";[\s\S]*OBJECT_VAR: \{"enterprise":"1701-D","activeDuty":true,"captian":"Picard"\};[\s\S]*}/
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
				/interface MyCloudflareEnvInterface \{[\s\S]*SOMETHING: "asdasdfasdf";[\s\S]*ANOTHER: "thing";[\s\S]*OBJECT_VAR: \{"enterprise":"1701-D","activeDuty":true,"captian":"Picard"\};[\s\S]*}/
			);
		});
	});
});
