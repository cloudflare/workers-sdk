import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import dedent from "ts-dedent";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { endEventLoop } from "../helpers/end-event-loop";
import { mockConsoleMethods } from "../helpers/mock-console";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";
import { replaceRandomWithConstantData } from "../helpers/string-dynamic-values-matcher";

describe("pages functions build", () => {
	const std = mockConsoleMethods();

	runInTempDir();

	afterEach(async () => {
		// Force a tick to ensure that all promises resolve
		await endEventLoop();
	});

	it("should throw an error if no worker script and no Functions directory was found", async ({
		expect,
	}) => {
		await expect(runWrangler("pages functions build")).rejects.toThrowError();
		expect(std.err).toContain("Could not find anything to build.");
	});

	it("should build functions", async ({ expect }) => {
		/* ---------------------------- */
		/*       Set up Functions       */
		/* ---------------------------- */
		mkdirSync("functions");
		writeFileSync(
			"functions/hello.js",
			`
    export async function onRequest() {
      return new Response("Hello from Pages Functions");
    }
    `
		);

		/* --------------------------------- */
		/*     Run cmd & make assertions     */
		/* --------------------------------- */
		await runWrangler(`pages functions build`);

		expect(existsSync("_worker.bundle")).toBe(true);
		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			✨ Compiled Worker successfully"
		`);
		expect(std.err).toMatchInlineSnapshot(`""`);
	});

	it("should include any external modules imported by functions in the output bundle", async ({
		expect,
	}) => {
		/* ---------------------------- */
		/*       Set up wasm files      */
		/* ---------------------------- */
		mkdirSync("wasm");
		writeFileSync("wasm/greeting.wasm", "Hello");
		writeFileSync("wasm/name.wasm", "wasm Functions");

		/* ---------------------------- */
		/*       Set up Functions       */
		/* ---------------------------- */
		mkdirSync("functions");
		writeFileSync(
			"functions/hello.js",
			`
    import hello from "./../wasm/greeting.wasm";
    import name from "./../wasm/name.wasm";

    export async function onRequest() {
      const greetingModule = await WebAssembly.instantiate(greeting);
			const nameModule = await WebAssembly.instantiate(name);
      return new Response(greetingModule.exports.hello + " " + nameModule.exports.name);
    }
    `
		);

		/* --------------------------------- */
		/*     Run cmd & make assertions     */
		/* --------------------------------- */
		await runWrangler(`pages functions build --outfile=_worker.bundle`);

		expect(existsSync("_worker.bundle")).toBe(true);
		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			✨ Compiled Worker successfully"
		`);

		// some values in workerBundleContents, such as the undici form boundary
		// or the file hashes, are randomly generated. Let's replace them
		// with static values so we can test the file contents
		const workerBundleContents = readFileSync("_worker.bundle", "utf-8");
		const workerBundleWithConstantData = replaceRandomWithConstantData(
			workerBundleContents,
			[
				[/------formdata-undici-0.[0-9]*/g, "------formdata-undici-0.test"],
				[/functionsWorker-0.[0-9]*.js/g, "functionsWorker-0.test.js"],
				[/[0-9a-z]*-greeting.wasm/g, "test-greeting.wasm"],
				[/[0-9a-z]*-name.wasm/g, "test-name.wasm"],
			]
		);

		// check we appended the metadata
		expect(workerBundleWithConstantData).toContain(
			`Content-Disposition: form-data; name="metadata"`
		);
		expect(workerBundleWithConstantData).toContain(
			`{"main_module":"functionsWorker-0.test.js"}`
		);

		// check we appended the compiled Worker
		expect(workerBundleWithConstantData).toContain(
			`Content-Disposition: form-data; name="functionsWorker-0.test.js"; filename="functionsWorker-0.test.js"`
		);

		// check we appended the wasm modules
		expect(workerBundleWithConstantData).toContain(
			`Content-Disposition: form-data; name="./test-greeting.wasm"; filename="./test-greeting.wasm"`
		);
		expect(workerBundleWithConstantData).toContain(
			`Content-Disposition: form-data; name="./test-name.wasm"; filename="./test-name.wasm"`
		);
		expect(workerBundleWithConstantData).toContain(`Hello`);
		expect(workerBundleWithConstantData).toContain(`wasm Functions`);

		expect(std.err).toMatchInlineSnapshot(`""`);
	});

	it("should output a directory with --outdir", async ({ expect }) => {
		/* ---------------------------- */
		/*       Set up wasm files      */
		/* ---------------------------- */
		mkdirSync("wasm");
		writeFileSync("wasm/greeting.wasm", "Hello");
		writeFileSync("wasm/name.wasm", "wasm Functions");

		/* ---------------------------- */
		/*       Set up Functions       */
		/* ---------------------------- */
		mkdirSync("functions");
		writeFileSync(
			"functions/hello.js",
			`
    import hello from "./../wasm/greeting.wasm";
    import name from "./../wasm/name.wasm";

    export async function onRequest() {
      const greetingModule = await WebAssembly.instantiate(greeting);
			const nameModule = await WebAssembly.instantiate(name);
      return new Response(greetingModule.exports.hello + " " + nameModule.exports.name);
    }
    `
		);

		/* --------------------------------- */
		/*     Run cmd & make assertions     */
		/* --------------------------------- */
		await runWrangler(`pages functions build --outdir=dist`);

		expect(existsSync("dist")).toBe(true);
		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			✨ Compiled Worker successfully"
		`);

		expect(readdirSync("dist").sort()).toMatchInlineSnapshot(`
			[
			  "e8f0f80fe25d71a0fc2b9a08c877020211192308-name.wasm",
			  "f7ff9e8b7bb2e09b70935a5d785e0cc5d9d0abf0-greeting.wasm",
			  "index.js",
			]
		`);
	});

	it("should output a metafile when --metafile is set", async ({ expect }) => {
		// Setup a basic pages function
		mkdirSync("functions");
		writeFileSync(
			"functions/hello.js",
			`export function onRequest() { return new Response("Hello from Pages Functions"); }`
		);

		// Run the build command
		await runWrangler(`pages functions build --outdir=dist --metafile`);

		// Check if file exists
		expect(existsSync("dist/bundle-meta.json")).toBe(true);

		// Structure checks for the metafile
		const meta = JSON.parse(
			readFileSync("dist/bundle-meta.json", { encoding: "utf8" })
		);

		expect(meta.inputs).toBeDefined();
		expect(meta.outputs).toBeDefined();
	});

	it("should build _worker.js", async ({ expect }) => {
		/* ---------------------------- */
		/*       Set up js files        */
		/* ---------------------------- */
		mkdirSync("utils");
		writeFileSync(
			"utils/meaning-of-life.js",
			`
export const MEANING_OF_LIFE = 21;
`
		);

		/* ---------------------------- */
		/*       Set up _worker.js      */
		/* ---------------------------- */
		mkdirSync("public");
		writeFileSync(
			"public/_worker.js",
			`
import { MEANING_OF_LIFE } from "./../utils/meaning-of-life.js";

export default {
  async fetch(request, env) {
    return new Response("Hello from _worker.js. The meaning of life is " + MEANING_OF_LIFE);
  },
};`
		);

		/* --------------------------------- */
		/*     Run cmd & make assertions     */
		/* --------------------------------- */
		await runWrangler(
			`pages functions build --build-output-directory=public --outfile=_worker.bundle`
		);
		expect(existsSync("_worker.bundle")).toBe(true);
		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			✨ Compiled Worker successfully"
		`);

		// some values in workerBundleContents, such as the undici form boundary
		// or the file hashes, are randomly generated. Let's replace them
		// with static values so we can test the file contents
		const workerBundleContents = readFileSync("_worker.bundle", "utf-8");
		const workerBundleWithConstantData = replaceRandomWithConstantData(
			workerBundleContents,
			[
				[/------formdata-undici-0.[0-9]*/g, "------formdata-undici-0.test"],
				[/functionsWorker-0.[0-9]*.js/g, "functionsWorker-0.test.js"],
			]
		);

		expect(workerBundleWithConstantData).toMatchInlineSnapshot(`
			"------formdata-undici-0.test
			Content-Disposition: form-data; name="metadata"

			{"main_module":"functionsWorker-0.test.js"}
			------formdata-undici-0.test
			Content-Disposition: form-data; name="functionsWorker-0.test.js"; filename="functionsWorker-0.test.js"
			Content-Type: application/javascript+module

			// ../utils/meaning-of-life.js
			var MEANING_OF_LIFE = 21;

			// _worker.js
			var worker_default = {
			  async fetch(request, env) {
			    return new Response("Hello from _worker.js. The meaning of life is " + MEANING_OF_LIFE);
			  }
			};
			export {
			  worker_default as default
			};

			------formdata-undici-0.test--
			"
		`);
		expect(std.err).toMatchInlineSnapshot(`""`);
	});

	it("should include all external modules imported by _worker.js in the output bundle, when bundling _worker.js", async ({
		expect,
	}) => {
		/* ---------------------------- */
		/*       Set up wasm files      */
		/* ---------------------------- */
		mkdirSync("wasm");
		writeFileSync("wasm/greeting.wasm", "Hello");
		writeFileSync("wasm/name.wasm", "wasm _worker.js");

		/* ---------------------------- */
		/*       Set up _worker.js      */
		/* ---------------------------- */
		mkdirSync("public");
		writeFileSync(
			"public/_worker.js",
			`
import greeting from "./../wasm/greeting.wasm";
import name from "./../wasm/name.wasm";

export default {
  async fetch(request, env) {
    const greetingModule = await WebAssembly.instantiate(greeting);
    const nameModule = await WebAssembly.instantiate(name);
    return new Response(greetingModule.exports.hello + " " + nameModule.exports.name + "!");
  },
};`
		);

		/* --------------------------------- */
		/*     Run cmd & make assertions     */
		/* --------------------------------- */
		await runWrangler(`pages functions build --build-output-directory=public`);

		// built to _worker.js by default
		expect(existsSync("_worker.bundle")).toBe(true);
		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			✨ Compiled Worker successfully"
		`);

		// some values in workerBundleContents, such as the undici form boundary
		// or the file hashes, are randomly generated. Let's replace them
		// with static values so we can test the file contents
		const workerBundleContents = readFileSync("_worker.bundle", "utf-8");
		const workerBundleWithConstantData = replaceRandomWithConstantData(
			workerBundleContents,
			[
				[/------formdata-undici-0.[0-9]*/g, "------formdata-undici-0.test"],
				[/functionsWorker-0.[0-9]*.js/g, "functionsWorker-0.test.js"],
				[/[0-9a-z]*-greeting.wasm/g, "test-greeting.wasm"],
				[/[0-9a-z]*-name.wasm/g, "test-name.wasm"],
			]
		);

		// check we appended the metadata
		expect(workerBundleWithConstantData).toContain(
			`Content-Disposition: form-data; name="metadata"`
		);
		expect(workerBundleWithConstantData).toContain(
			`{"main_module":"functionsWorker-0.test.js"}`
		);

		// check we appended the wasm modules
		expect(workerBundleWithConstantData).toContain(
			`Content-Disposition: form-data; name="./test-greeting.wasm"; filename="./test-greeting.wasm"`
		);
		expect(workerBundleWithConstantData).toContain(
			`Content-Disposition: form-data; name="./test-name.wasm"; filename="./test-name.wasm"`
		);
		expect(workerBundleWithConstantData).toContain(`Hello`);
		expect(workerBundleWithConstantData).toContain(`wasm _worker.js`);

		expect(std.err).toMatchInlineSnapshot(`""`);
	});

	it("should build _worker.js over /functions, if both are present", async ({
		expect,
	}) => {
		/* ---------------------------- */
		/*       Set up _worker.js      */
		/* ---------------------------- */
		mkdirSync("public");
		writeFileSync(
			"public/_worker.js",
			`
export default {
  async fetch(request, env) {
    return new Response("Hello from _worker.js");
  },
};`
		);

		/* ---------------------------- */
		/*       Set up Functions       */
		/* ---------------------------- */
		mkdirSync("functions");
		writeFileSync(
			"functions/hello.js",
			`
    export async function onRequest() {
      return new Response("Hello from Pages Functions");
    }
    `
		);

		/* --------------------------------- */
		/*     Run cmd & make assertions     */
		/* --------------------------------- */
		await runWrangler(`pages functions build --outfile=public/_worker.bundle`);

		expect(existsSync("public/_worker.bundle")).toBe(true);
		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			✨ Compiled Worker successfully"
		`);

		// some values in workerBundleContents, such as the undici form boundary
		// or the file hashes, are randomly generated. Let's replace them
		// with static values so we can test the file contents
		const workerBundleContents = readFileSync("public/_worker.bundle", "utf-8");
		const workerBundleWithConstantData = replaceRandomWithConstantData(
			workerBundleContents,
			[
				[/------formdata-undici-0.[0-9]*/g, "------formdata-undici-0.test"],
				[/functionsWorker-0.[0-9]*.js/g, "functionsWorker-0.test.js"],
			]
		);

		expect(workerBundleWithConstantData).toMatchInlineSnapshot(`
			"------formdata-undici-0.test
			Content-Disposition: form-data; name="metadata"

			{"main_module":"functionsWorker-0.test.js"}
			------formdata-undici-0.test
			Content-Disposition: form-data; name="functionsWorker-0.test.js"; filename="functionsWorker-0.test.js"
			Content-Type: application/javascript+module

			// _worker.js
			var worker_default = {
			  async fetch(request, env) {
			    return new Response("Hello from _worker.js");
			  }
			};
			export {
			  worker_default as default
			};

			------formdata-undici-0.test--
			"
		`);

		expect(std.err).toMatchInlineSnapshot(`""`);
	});

	it("should leave Node.js imports when the `nodejs_compat` compatibility flag is set", async ({
		expect,
	}) => {
		mkdirSync("functions");
		writeFileSync(
			"functions/hello.js",
			`
		import { AsyncLocalStorage } from 'node:async_hooks';

    export async function onRequest() {
			console.log(AsyncLocalStorage);
      return new Response("Hello from Pages Functions");
    }
    `
		);

		await runWrangler(
			`pages functions build --outfile=public/_worker.bundle --compatibility-flag=nodejs_compat`
		);

		expect(existsSync("public/_worker.bundle")).toBe(true);
		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			✨ Compiled Worker successfully"
		`);

		expect(readFileSync("public/_worker.bundle", "utf-8")).toContain(
			`import { AsyncLocalStorage } from "node:async_hooks";`
		);
	});

	it("should warn at Node.js imports when the `nodejs_compat` compatibility flag is not set", async ({
		expect,
	}) => {
		mkdirSync("functions");
		writeFileSync(
			"functions/hello.js",
			`
		import { AsyncLocalStorage } from 'node:async_hooks';

    export async function onRequest() {
			console.log(AsyncLocalStorage);
      return new Response("Hello from Pages Functions");
    }
    `
		);

		await expect(
			await runWrangler(`pages functions build --outfile=public/_worker.bundle`)
		);
		expect(std.warn).toMatchInlineSnapshot(`
			"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mThe package "node:async_hooks" wasn't found on the file system but is built into node.[0m

			  Your Worker may throw errors at runtime unless you enable the "nodejs_compat" compatibility flag.
			  Refer to [4mhttps://developers.cloudflare.com/workers/runtime-apis/nodejs/[0m for more details. Imported
			  from:
			   - hello.js

			"
		`);
	});

	it("should compile a _worker.js/ directory", async ({ expect }) => {
		mkdirSync("public");
		mkdirSync("public/_worker.js");
		writeFileSync(
			"public/_worker.js/index.js",
			`
import { cat } from "./cat.js";
import { dog } from "./dog.mjs";

export default {
  async fetch(request, env) {
		return new Response("Hello from _worker.js/index.js" + cat + dog);
	},
};`
		);
		writeFileSync(
			"public/_worker.js/cat.js",
			`
export const cat = "cat";`
		);
		writeFileSync(
			"public/_worker.js/dog.mjs",
			`
export const cat = "dog";`
		);

		await runWrangler(`pages functions build --outfile=public/_worker.bundle`);

		expect(existsSync("public/_worker.bundle")).toBe(true);
		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			┌─┬─┬─┐
			│ Name │ Type │ Size │
			├─┼─┼─┤
			│ cat.js │ esm │ xx KiB │
			├─┼─┼─┤
			│ dog.mjs │ esm │ xx KiB │
			├─┼─┼─┤
			│ Total (2 modules) │ │ xx KiB │
			└─┴─┴─┘
			✨ Compiled Worker successfully"
		`);

		const workerBundleContents = readFileSync("public/_worker.bundle", "utf-8");
		const workerBundleWithConstantData = replaceRandomWithConstantData(
			workerBundleContents,
			[
				[/------formdata-undici-0.[0-9]*/g, "------formdata-undici-0.test"],
				[/bundledWorker-0.[0-9]*.mjs/g, "bundledWorker-0.test.mjs"],
				[/bundledWorker-0.[0-9]*.map/g, "bundledWorker-0.test.map"],
			]
		);

		expect(workerBundleWithConstantData).toMatchInlineSnapshot(`
			"------formdata-undici-0.test
			Content-Disposition: form-data; name="metadata"

			{"main_module":"bundledWorker-0.test.mjs"}
			------formdata-undici-0.test
			Content-Disposition: form-data; name="bundledWorker-0.test.mjs"; filename="bundledWorker-0.test.mjs"
			Content-Type: application/javascript+module

			// _worker.js/index.js
			import { cat } from "./cat.js";
			import { dog } from "./dog.mjs";
			var index_default = {
			  async fetch(request, env) {
			    return new Response("Hello from _worker.js/index.js" + cat + dog);
			  }
			};
			export {
			  index_default as default
			};
			//# sourceMappingURL=bundledWorker-0.test.mjs.map

			------formdata-undici-0.test
			Content-Disposition: form-data; name="cat.js"; filename="cat.js"
			Content-Type: application/javascript+module


			export const cat = "cat";
			------formdata-undici-0.test
			Content-Disposition: form-data; name="dog.mjs"; filename="dog.mjs"
			Content-Type: application/javascript+module


			export const cat = "dog";
			------formdata-undici-0.test--
			"
		`);

		expect(std.err).toMatchInlineSnapshot(`""`);
	});
});

describe("functions build w/ config", () => {
	const std = mockConsoleMethods();

	runInTempDir();
	afterEach(async () => {
		// Force a tick to ensure that all promises resolve
		await endEventLoop();
	});

	beforeEach(() => {
		vi.stubEnv("PAGES_ENVIRONMENT", "production");
	});

	it("should include all config in the _worker.bundle metadata", async ({
		expect,
	}) => {
		// Write an example wrangler.toml file with a _lot_ of config
		writeFileSync(
			"wrangler.toml",
			dedent`
				name = "project-name"
				pages_build_output_dir = "dist-test"
				compatibility_date = "2023-02-14"
				placement = { mode = "smart" }
				limits = { cpu_ms = 50 }

				[env.production.vars]
				TEST_JSON_PREVIEW = """
				{
				json: "value"
				}"""
				TEST_PLAINTEXT_PREVIEW = "PLAINTEXT"

				[[env.production.kv_namespaces]]
				id = "kv-id"
				binding = "KV_PREVIEW"

				[[env.production.kv_namespaces]]
				id = "kv-id"
				binding = "KV_PREVIEW2"

				[[env.production.durable_objects.bindings]]
				name = "DO_PREVIEW"
				class_name = "some-class-do-id"
				script_name = "some-script-do-id"
				environment = "some-environment-do-id"

				[[env.production.durable_objects.bindings]]
				name = "DO_PREVIEW2"
				class_name = "some-class-do-id"
				script_name = "some-script-do-id"
				environment = "some-environment-do-id"

				[[env.production.durable_objects.bindings]]
				name = "DO_PREVIEW3"
				class_name = "do-class"
				script_name = "do-s"
				environment = "do-e"

				[[env.production.d1_databases]]
				database_id = "d1-id"
				binding = "D1_PREVIEW"
				database_name = "D1_PREVIEW"

				[[env.production.d1_databases]]
				database_id = "d1-id"
				binding = "D1_PREVIEW2"
				database_name = "D1_PREVIEW2"

				[[env.production.r2_buckets]]
				bucket_name = "r2-name"
				binding = "R2_PREVIEW"

				[[env.production.r2_buckets]]
				bucket_name = "r2-name"
				binding = "R2_PREVIEW2"

				[[env.production.services]]
				binding = "SERVICE_PREVIEW"
				service = "service"
				environment = "production"

				[[env.production.services]]
				binding = "SERVICE_PREVIEW2"
				service = "service"
				environment = "production"

				[[env.production.queues.producers]]
				binding = "QUEUE_PREVIEW"
				queue = "q-id"

				[[env.production.queues.producers]]
				binding = "QUEUE_PREVIEW2"
				queue = "q-id"

				[[env.production.analytics_engine_datasets]]
				binding = "AE_PREVIEW"
				dataset = "data"

				[[env.production.analytics_engine_datasets]]
				binding = "AE_PREVIEW2"
				dataset = "data"

				[env.production.ai]
				binding = "AI_PREVIEW"`
		);
		/* ---------------------------- */
		/*       Set up js files        */
		/* ---------------------------- */
		mkdirSync("utils");
		writeFileSync(
			"utils/meaning-of-life.js",
			`
export const MEANING_OF_LIFE = 21;
`
		);

		/* ---------------------------- */
		/*       Set up _worker.js      */
		/* ---------------------------- */
		mkdirSync("dist-test");
		writeFileSync(
			"dist-test/_worker.js",
			`
import { MEANING_OF_LIFE } from "./../utils/meaning-of-life.js";

export default {
  async fetch(request, env) {
    return new Response("Hello from _worker.js. The meaning of life is " + MEANING_OF_LIFE);
  },
};`
		);

		/* --------------------------------- */
		/*     Run cmd & make assertions     */
		/* --------------------------------- */
		// --build-output-directory is included here to validate that it's value is ignored
		await runWrangler(
			`pages functions build --build-output-directory public --outfile=_worker.bundle --build-metadata-path build-metadata.json --project-directory .`
		);
		expect(existsSync("_worker.bundle")).toBe(true);
		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			✨ Compiled Worker successfully"
		`);

		// some values in workerBundleContents, such as the undici form boundary
		// or the file hashes, are randomly generated. Let's replace them
		// with static values so we can test the file contents
		const workerBundleContents = readFileSync("_worker.bundle", "utf-8");
		const workerBundleWithConstantData = replaceRandomWithConstantData(
			workerBundleContents,
			[
				[/------formdata-undici-0.[0-9]*/g, "------formdata-undici-0.test"],
				[/functionsWorker-0.[0-9]*.js/g, "functionsWorker-0.test.js"],
			]
		);

		expect(workerBundleWithConstantData).toMatchInlineSnapshot(`
			"------formdata-undici-0.test
			Content-Disposition: form-data; name="metadata"

			{"main_module":"functionsWorker-0.test.js","bindings":[{"name":"TEST_JSON_PREVIEW","type":"plain_text","text":"{\\njson: \\"value\\"\\n}"},{"name":"TEST_PLAINTEXT_PREVIEW","type":"plain_text","text":"PLAINTEXT"},{"name":"KV_PREVIEW","type":"kv_namespace","namespace_id":"kv-id"},{"name":"KV_PREVIEW2","type":"kv_namespace","namespace_id":"kv-id"},{"name":"DO_PREVIEW","type":"durable_object_namespace","class_name":"some-class-do-id","script_name":"some-script-do-id","environment":"some-environment-do-id"},{"name":"DO_PREVIEW2","type":"durable_object_namespace","class_name":"some-class-do-id","script_name":"some-script-do-id","environment":"some-environment-do-id"},{"name":"DO_PREVIEW3","type":"durable_object_namespace","class_name":"do-class","script_name":"do-s","environment":"do-e"},{"type":"queue","name":"QUEUE_PREVIEW","queue_name":"q-id"},{"type":"queue","name":"QUEUE_PREVIEW2","queue_name":"q-id"},{"name":"R2_PREVIEW","type":"r2_bucket","bucket_name":"r2-name"},{"name":"R2_PREVIEW2","type":"r2_bucket","bucket_name":"r2-name"},{"name":"D1_PREVIEW","type":"d1","id":"d1-id"},{"name":"D1_PREVIEW2","type":"d1","id":"d1-id"},{"name":"SERVICE_PREVIEW","type":"service","service":"service","environment":"production"},{"name":"SERVICE_PREVIEW2","type":"service","service":"service","environment":"production"},{"name":"AE_PREVIEW","type":"analytics_engine","dataset":"data"},{"name":"AE_PREVIEW2","type":"analytics_engine","dataset":"data"},{"name":"AI_PREVIEW","type":"ai"}],"compatibility_date":"2023-02-14","compatibility_flags":[],"placement":{"mode":"smart"},"limits":{"cpu_ms":50}}
			------formdata-undici-0.test
			Content-Disposition: form-data; name="functionsWorker-0.test.js"; filename="functionsWorker-0.test.js"
			Content-Type: application/javascript+module

			// ../utils/meaning-of-life.js
			var MEANING_OF_LIFE = 21;

			// _worker.js
			var worker_default = {
			  async fetch(request, env) {
			    return new Response("Hello from _worker.js. The meaning of life is " + MEANING_OF_LIFE);
			  }
			};
			export {
			  worker_default as default
			};

			------formdata-undici-0.test--
			"
		`);
		const buildMetadataContents = readFileSync("build-metadata.json", "utf-8");
		expect(buildMetadataContents).toMatchInlineSnapshot(
			`"{"wrangler_config_hash":"75b267c678474945699c162b6d75e5e4a88fb8b491fc0650a390e097186031ab","build_output_directory":"dist-test"}"`
		);

		expect(std.err).toMatchInlineSnapshot(`""`);
	});

	it("should ignore config with a non-pages config file", async ({
		expect,
	}) => {
		writeFileSync(
			"wrangler.toml",
			dedent`
				name = "project-name"
				compatibility_date = "2023-02-14"
				placement = { mode = "smart" }
				limits = { cpu_ms = 50 }

				[env.production.vars]
				TEST_JSON_PREVIEW = """
				{
				json: "value"
				}"""
				TEST_PLAINTEXT_PREVIEW = "PLAINTEXT"

				[[env.production.kv_namespaces]]
				id = "kv-id"
				binding = "KV_PREVIEW"

				[[env.production.kv_namespaces]]
				id = "kv-id"
				binding = "KV_PREVIEW2"

				[[env.production.durable_objects.bindings]]
				name = "DO_PREVIEW"
				class_name = "some-class-do-id"
				script_name = "some-script-do-id"
				environment = "some-environment-do-id"

				[[env.production.durable_objects.bindings]]
				name = "DO_PREVIEW2"
				class_name = "some-class-do-id"
				script_name = "some-script-do-id"
				environment = "some-environment-do-id"

				[[env.production.durable_objects.bindings]]
				name = "DO_PREVIEW3"
				class_name = "do-class"
				script_name = "do-s"
				environment = "do-e"

				[[env.production.d1_databases]]
				database_id = "d1-id"
				binding = "D1_PREVIEW"
				database_name = "D1_PREVIEW"

				[[env.production.d1_databases]]
				database_id = "d1-id"
				binding = "D1_PREVIEW2"
				database_name = "D1_PREVIEW2"

				[[env.production.r2_buckets]]
				bucket_name = "r2-name"
				binding = "R2_PREVIEW"

				[[env.production.r2_buckets]]
				bucket_name = "r2-name"
				binding = "R2_PREVIEW2"

				[[env.production.services]]
				binding = "SERVICE_PREVIEW"
				service = "service"
				environment = "production"

				[[env.production.services]]
				binding = "SERVICE_PREVIEW2"
				service = "service"
				environment = "production"

				[[env.production.queues.producers]]
				binding = "QUEUE_PREVIEW"
				queue = "q-id"

				[[env.production.queues.producers]]
				binding = "QUEUE_PREVIEW2"
				queue = "q-id"

				[[env.production.analytics_engine_datasets]]
				binding = "AE_PREVIEW"
				dataset = "data"

				[[env.production.analytics_engine_datasets]]
				binding = "AE_PREVIEW2"
				dataset = "data"

				[env.production.ai]
				binding = "AI_PREVIEW"`
		);
		/* ---------------------------- */
		/*       Set up js files        */
		/* ---------------------------- */
		mkdirSync("utils");
		writeFileSync(
			"utils/meaning-of-life.js",
			`
export const MEANING_OF_LIFE = 21;
`
		);

		/* ---------------------------- */
		/*       Set up _worker.js      */
		/* ---------------------------- */
		mkdirSync("dist-test");
		writeFileSync(
			"dist-test/_worker.js",
			`
import { MEANING_OF_LIFE } from "./../utils/meaning-of-life.js";

export default {
  async fetch(request, env) {
    return new Response("Hello from _worker.js. The meaning of life is " + MEANING_OF_LIFE);
  },
};`
		);

		/* --------------------------------- */
		/*     Run cmd & make assertions     */
		/* --------------------------------- */
		await runWrangler(
			`pages functions build --build-output-directory dist-test --outfile=_worker.bundle --build-metadata-path build-metadata.json --project-directory .`
		);
		expect(existsSync("_worker.bundle")).toBe(true);
		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			✨ Compiled Worker successfully"
		`);

		// some values in workerBundleContents, such as the undici form boundary
		// or the file hashes, are randomly generated. Let's replace them
		// with static values so we can test the file contents
		const workerBundleContents = readFileSync("_worker.bundle", "utf-8");
		const workerBundleWithConstantData = replaceRandomWithConstantData(
			workerBundleContents,
			[
				[/------formdata-undici-0.[0-9]*/g, "------formdata-undici-0.test"],
				[/functionsWorker-0.[0-9]*.js/g, "functionsWorker-0.test.js"],
			]
		);

		expect(workerBundleWithConstantData).toMatchInlineSnapshot(`
			"------formdata-undici-0.test
			Content-Disposition: form-data; name="metadata"

			{"main_module":"functionsWorker-0.test.js"}
			------formdata-undici-0.test
			Content-Disposition: form-data; name="functionsWorker-0.test.js"; filename="functionsWorker-0.test.js"
			Content-Type: application/javascript+module

			// ../utils/meaning-of-life.js
			var MEANING_OF_LIFE = 21;

			// _worker.js
			var worker_default = {
			  async fetch(request, env) {
			    return new Response("Hello from _worker.js. The meaning of life is " + MEANING_OF_LIFE);
			  }
			};
			export {
			  worker_default as default
			};

			------formdata-undici-0.test--
			"
		`);
		const buildMetadataExists = existsSync("build-metadata.json");
		// build-metadata should not exist
		expect(buildMetadataExists).toBeFalsy();

		expect(std.err).toMatchInlineSnapshot(`""`);
	});
	it("should ignore config with a non-pages config file w/ invalid environment", async ({
		expect,
	}) => {
		writeFileSync(
			"wrangler.toml",
			dedent`
				name = "project-name"
				compatibility_date = "2023-02-14"
				placement = { mode = "smart" }
				limits = { cpu_ms = 50 }

				[env.staging.vars]
				TEST_JSON_PREVIEW = """
				{
				json: "value"
				}"""
				TEST_PLAINTEXT_PREVIEW = "PLAINTEXT"

				[[env.staging.kv_namespaces]]
				id = "kv-id"
				binding = "KV_PREVIEW"

				[[env.staging.kv_namespaces]]
				id = "kv-id"
				binding = "KV_PREVIEW2"

				[[env.staging.durable_objects.bindings]]
				name = "DO_PREVIEW"
				class_name = "some-class-do-id"
				script_name = "some-script-do-id"
				environment = "some-environment-do-id"

				[[env.staging.durable_objects.bindings]]
				name = "DO_PREVIEW2"
				class_name = "some-class-do-id"
				script_name = "some-script-do-id"
				environment = "some-environment-do-id"

				[[env.staging.durable_objects.bindings]]
				name = "DO_PREVIEW3"
				class_name = "do-class"
				script_name = "do-s"
				environment = "do-e"

				[[env.staging.d1_databases]]
				database_id = "d1-id"
				binding = "D1_PREVIEW"
				database_name = "D1_PREVIEW"

				[[env.staging.d1_databases]]
				database_id = "d1-id"
				binding = "D1_PREVIEW2"
				database_name = "D1_PREVIEW2"

				[[env.staging.r2_buckets]]
				bucket_name = "r2-name"
				binding = "R2_PREVIEW"

				[[env.staging.r2_buckets]]
				bucket_name = "r2-name"
				binding = "R2_PREVIEW2"

				[[env.staging.services]]
				binding = "SERVICE_PREVIEW"
				service = "service"
				environment = "production"

				[[env.staging.services]]
				binding = "SERVICE_PREVIEW2"
				service = "service"
				environment = "production"

				[[env.staging.queues.producers]]
				binding = "QUEUE_PREVIEW"
				queue = "q-id"

				[[env.staging.queues.producers]]
				binding = "QUEUE_PREVIEW2"
				queue = "q-id"

				[[env.staging.analytics_engine_datasets]]
				binding = "AE_PREVIEW"
				dataset = "data"

				[[env.staging.analytics_engine_datasets]]
				binding = "AE_PREVIEW2"
				dataset = "data"

				[env.staging.ai]
				binding = "AI_PREVIEW"`
		);
		/* ---------------------------- */
		/*       Set up js files        */
		/* ---------------------------- */
		mkdirSync("utils");
		writeFileSync(
			"utils/meaning-of-life.js",
			`
export const MEANING_OF_LIFE = 21;
`
		);

		/* ---------------------------- */
		/*       Set up _worker.js      */
		/* ---------------------------- */
		mkdirSync("dist-test");
		writeFileSync(
			"dist-test/_worker.js",
			`
import { MEANING_OF_LIFE } from "./../utils/meaning-of-life.js";

export default {
  async fetch(request, env) {
    return new Response("Hello from _worker.js. The meaning of life is " + MEANING_OF_LIFE);
  },
};`
		);

		/* --------------------------------- */
		/*     Run cmd & make assertions     */
		/* --------------------------------- */
		await runWrangler(
			`pages functions build --build-output-directory dist-test --outfile=_worker.bundle --build-metadata-path build-metadata.json --project-directory .`
		);
		expect(existsSync("_worker.bundle")).toBe(true);
		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			✨ Compiled Worker successfully"
		`);

		// some values in workerBundleContents, such as the undici form boundary
		// or the file hashes, are randomly generated. Let's replace them
		// with static values so we can test the file contents
		const workerBundleContents = readFileSync("_worker.bundle", "utf-8");
		const workerBundleWithConstantData = replaceRandomWithConstantData(
			workerBundleContents,
			[
				[/------formdata-undici-0.[0-9]*/g, "------formdata-undici-0.test"],
				[/functionsWorker-0.[0-9]*.js/g, "functionsWorker-0.test.js"],
			]
		);

		expect(workerBundleWithConstantData).toMatchInlineSnapshot(`
			"------formdata-undici-0.test
			Content-Disposition: form-data; name="metadata"

			{"main_module":"functionsWorker-0.test.js"}
			------formdata-undici-0.test
			Content-Disposition: form-data; name="functionsWorker-0.test.js"; filename="functionsWorker-0.test.js"
			Content-Type: application/javascript+module

			// ../utils/meaning-of-life.js
			var MEANING_OF_LIFE = 21;

			// _worker.js
			var worker_default = {
			  async fetch(request, env) {
			    return new Response("Hello from _worker.js. The meaning of life is " + MEANING_OF_LIFE);
			  }
			};
			export {
			  worker_default as default
			};

			------formdata-undici-0.test--
			"
		`);
		const buildMetadataExists = existsSync("build-metadata.json");
		// build-metadata should not exist
		expect(buildMetadataExists).toBeFalsy();

		expect(std.err).toMatchInlineSnapshot(`""`);
	});
	it("should ignore unparseable config file", async ({ expect }) => {
		writeFileSync(
			"wrangler.toml",
			dedent`
				name = "project-name"
				compatibility_date = "2023-02-14"
				pages_build_output_dir = "dist-test"
				placement = { mode = "smart" }
				limits = { cpu_ms = 50 }"`
		);
		/* ---------------------------- */
		/*       Set up js files        */
		/* ---------------------------- */
		mkdirSync("utils");
		writeFileSync(
			"utils/meaning-of-life.js",
			`
export const MEANING_OF_LIFE = 21;
`
		);

		/* ---------------------------- */
		/*       Set up _worker.js      */
		/* ---------------------------- */
		mkdirSync("dist-test");
		writeFileSync(
			"dist-test/_worker.js",
			`
import { MEANING_OF_LIFE } from "./../utils/meaning-of-life.js";

export default {
  async fetch(request, env) {
    return new Response("Hello from _worker.js. The meaning of life is " + MEANING_OF_LIFE);
  },
};`
		);

		/* --------------------------------- */
		/*     Run cmd & make assertions     */
		/* --------------------------------- */
		await runWrangler(
			`pages functions build --build-output-directory dist-test --outfile=_worker.bundle --build-metadata-path build-metadata.json --project-directory .`
		);
		expect(existsSync("_worker.bundle")).toBe(true);
		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			✨ Compiled Worker successfully"
		`);

		// some values in workerBundleContents, such as the undici form boundary
		// or the file hashes, are randomly generated. Let's replace them
		// with static values so we can test the file contents
		const workerBundleContents = readFileSync("_worker.bundle", "utf-8");
		const workerBundleWithConstantData = replaceRandomWithConstantData(
			workerBundleContents,
			[
				[/------formdata-undici-0.[0-9]*/g, "------formdata-undici-0.test"],
				[/functionsWorker-0.[0-9]*.js/g, "functionsWorker-0.test.js"],
			]
		);

		expect(workerBundleWithConstantData).toMatchInlineSnapshot(`
			"------formdata-undici-0.test
			Content-Disposition: form-data; name="metadata"

			{"main_module":"functionsWorker-0.test.js"}
			------formdata-undici-0.test
			Content-Disposition: form-data; name="functionsWorker-0.test.js"; filename="functionsWorker-0.test.js"
			Content-Type: application/javascript+module

			// ../utils/meaning-of-life.js
			var MEANING_OF_LIFE = 21;

			// _worker.js
			var worker_default = {
			  async fetch(request, env) {
			    return new Response("Hello from _worker.js. The meaning of life is " + MEANING_OF_LIFE);
			  }
			};
			export {
			  worker_default as default
			};

			------formdata-undici-0.test--
			"
		`);
		const buildMetadataExists = existsSync("build-metadata.json");
		// build-metadata should not exist
		expect(buildMetadataExists).toBeFalsy();

		// This logs a parsing error, but continues anyway
		expect(std.err).toMatchInlineSnapshot(`
			"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mInvalid TOML document: each key-value declaration must be followed by an end-of-line[0m

			    <cwd>/wrangler.toml:5:24:
			[37m      5 │ limits = { cpu_ms = 50 }[32m[37m"
			        ╵                         [32m^[0m

			"
		`);
	});
});
