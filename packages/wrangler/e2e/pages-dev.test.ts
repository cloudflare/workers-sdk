import { setTimeout } from "node:timers/promises";
import getPort from "get-port";
import dedent from "ts-dedent";
import { fetch } from "undici";
import { describe, expect, it } from "vitest";
import { WranglerE2ETestHelper } from "./helpers/e2e-wrangler-test";
import { fetchText } from "./helpers/fetch-text";
import { normalizeOutput } from "./helpers/normalize";

describe("pages dev", () => {
	it("should warn if no [--compatibility_date] command line arg was specified", async () => {
		const helper = new WranglerE2ETestHelper();
		await helper.seed({
			"_worker.js": dedent`
					export default {
						fetch(request, env) {
							return new Response("Testing [--compatibility_date]")
						}
					}`,
		});
		const port = await getPort();
		const worker = helper.runLongLived(`wrangler pages dev --port ${port} .`);
		const { url } = await worker.waitForReady();

		const currentDate = new Date().toISOString().substring(0, 10);
		const output = worker.currentOutput.replaceAll(
			currentDate,
			"<current-date>"
		);
		expect(output).toContain(
			`No compatibility_date was specified. Using today's date: <current-date>.`
		);
		expect(output).toContain(
			`❯❯ Add one to your wrangler.toml file: compatibility_date = "<current-date>", or`
		);
		expect(output).toContain(
			`❯❯ Pass it in your terminal: wrangler pages dev [<DIRECTORY>] --compatibility-date=<current-date>`
		);

		const text = await fetchText(url);
		expect(text).toMatchInlineSnapshot('"Testing [--compatibility_date]"');
	});

	it("should warn that [--experimental-local] is no longer required, if specified", async () => {
		const helper = new WranglerE2ETestHelper();
		const port = await getPort();
		const worker = helper.runLongLived(
			`wrangler pages dev --port ${port} . --experimental-local`
		);
		await helper.seed({
			"_worker.js": dedent`
				export default {
					fetch(request, env) {
						return new Response("Testing [--experimental-local]")
					}
				}`,
		});
		const { url } = await worker.waitForReady();
		const text = await fetchText(url);
		expect(text).toMatchInlineSnapshot(`"Testing [--experimental-local]"`);
		expect(await worker.currentOutput).toContain(
			`--experimental-local is no longer required and will be removed in a future version`
		);
	});

	it("should show [--service] related warnings if specified as arg in the command line", async () => {
		const helper = new WranglerE2ETestHelper();
		const port = await getPort();
		const worker = helper.runLongLived(
			`wrangler pages dev --port ${port} . --service STAGING_SERVICE=test-worker@staging`
		);

		await worker.readUntil(
			/Support for service binding environments is experimental/
		);
		await worker.readUntil(
			/Support for service bindings in local mode is experimental and may change/
		);
	});

	it("should warn if bindings specified as args in the command line are invalid", async () => {
		const helper = new WranglerE2ETestHelper();
		const port = await getPort();
		const worker = helper.runLongLived(
			`wrangler pages dev . --port ${port} --service test --kv = --do test --d1 = --r2 =`
		);
		await worker.waitForReady();
		expect(await worker.currentOutput).toContain(
			`Could not parse Service binding: test`
		);
		expect(await worker.currentOutput).toContain(
			`Could not parse KV binding: =`
		);
		expect(await worker.currentOutput).toContain(
			`Could not parse Durable Object binding: test`
		);
		expect(await worker.currentOutput).toContain(
			`Could not parse R2 binding: =`
		);
		expect(await worker.currentOutput).toContain(
			`Could not parse D1 binding: =`
		);
	});

	it("should use bindings specified as args in the command line", async () => {
		const helper = new WranglerE2ETestHelper();
		await helper.seed({
			"_worker.js": dedent`
					export default {
						fetch(request, env) {
							return new Response("Hello world")
						}
					}`,
		});
		const port = await getPort();
		const worker = helper.runLongLived(
			`wrangler pages dev . --port ${port} --service TEST_SERVICE=test-worker --kv TEST_KV --do TEST_DO=TestDurableObject@a --d1 TEST_D1 --r2 TEST_R2`
		);
		await worker.waitForReady();
		expect(normalizeOutput(worker.currentOutput).replace(/\s/g, "")).toContain(
			`
			Your worker has access to the following bindings:
			- Durable Objects:
			  - TEST_DO: TestDurableObject (defined in a)
			- KV Namespaces:
			  - TEST_KV: TEST_KV
			- D1 Databases:
			  - TEST_D1: local-TEST_D1 (TEST_D1)
			- R2 Buckets:
			  - TEST_R2: TEST_R2
			- Services:
			  - TEST_SERVICE: test-worker
		`.replace(/\s/g, "")
		);
	});

	it("should modify worker during dev session (_worker)", async () => {
		const helper = new WranglerE2ETestHelper();
		await helper.seed({
			"_worker.js": dedent`
					export default {
						fetch(request, env) {
							return new Response("Hello World!")
						}
					}`,
		});
		const port = await getPort();
		const worker = helper.runLongLived(`wrangler pages dev --port ${port} .`);
		const { url } = await worker.waitForReady();

		await expect(
			fetch(url).then((r) => r.text())
		).resolves.toMatchInlineSnapshot('"Hello World!"');

		await helper.seed({
			"_worker.js": dedent`
						export default {
							fetch(request, env) {
								return new Response("Updated Worker!")
							}
						}`,
		});

		await worker.waitForReload();

		await expect(
			fetch(url).then((r) => r.text())
		).resolves.toMatchInlineSnapshot('"Updated Worker!"');
	});

	it("should modify worker during dev session (Functions)", async () => {
		const helper = new WranglerE2ETestHelper();
		const port = await getPort();
		const worker = helper.runLongLived(`wrangler pages dev --port ${port} .`);

		await helper.seed({
			"functions/_middleware.js": dedent`
					export async function onRequest() {
						return new Response("Hello World!")
					}`,
		});

		const { url } = await worker.waitForReady();

		await expect(
			fetch(url).then((r) => r.text())
		).resolves.toMatchInlineSnapshot('"Hello World!"');

		await helper.seed({
			"functions/_middleware.js": dedent`
					export async function onRequest() {
						return new Response("Updated Worker!")
					}`,
		});

		await worker.waitForReload();

		await expect(
			fetch(url).then((r) => r.text())
		).resolves.toMatchInlineSnapshot('"Updated Worker!"');
	});
	it("should support wrangler.toml", async () => {
		const helper = new WranglerE2ETestHelper();
		await helper.seed({
			"public/_worker.js": dedent`
						export default {
							async fetch(request, env) {
								return new Response("Pages supports wrangler.toml ⚡️⚡️")
							}
						}`,
			"wrangler.toml": dedent`
					name = "pages-project"
					pages_build_output_dir = "public"
					compatibility_date = "2023-01-01"
				`,
		});
		const port = await getPort();
		const worker = helper.runLongLived(`wrangler pages dev --port ${port}`);
		const { url } = await worker.waitForReady();

		const text = await fetchText(url);
		expect(text).toMatchInlineSnapshot('"Pages supports wrangler.toml ⚡️⚡️"');
	});

	it("should recover from syntax error during dev session (_worker)", async () => {
		const helper = new WranglerE2ETestHelper();
		const worker = helper.runLongLived("wrangler pages dev .");

		await helper.seed({
			"_worker.js": dedent`
					export default {
						fetch(request, env) {
							return new Response("Hello World!")
						}
					}`,
		});

		const { url } = await worker.waitForReady();

		await expect(
			fetch(url).then((r) => r.text())
		).resolves.toMatchInlineSnapshot('"Hello World!"');

		await helper.seed({
			"_worker.js": dedent`
					export default {
						fetch(request, env) {
							return new Response("Updated Worker!")
						} // Syntax Error
						}
					}`,
		});

		await setTimeout(5_000);

		await worker.readUntil(/Failed to bundle/);

		// And then make sure Wrangler hasn't crashed
		await helper.seed({
			"_worker.js": dedent`
					export default {
						fetch(request, env) {
							return new Response("Updated Worker!")
						}
					}`,
		});
		await worker.waitForReload();

		await expect(
			fetch(url).then((r) => r.text())
		).resolves.toMatchInlineSnapshot('"Updated Worker!"');
	});

	it("should recover from syntax error during dev session (Functions)", async () => {
		const helper = new WranglerE2ETestHelper();
		const port = await getPort();
		const worker = helper.runLongLived(`wrangler pages dev --port ${port} .`);

		await helper.seed({
			"functions/_middleware.js": dedent`
					export async function onRequest() {
						return new Response("Hello World!")
					}`,
		});

		const { url } = await worker.waitForReady();

		await expect(
			fetch(url).then((r) => r.text())
		).resolves.toMatchInlineSnapshot('"Hello World!"');

		await helper.seed({
			"functions/_middleware.js": dedent`
						export async function onRequest() {
							return new Response("Updated Worker!")
							} // Syntax Error
						}`,
		});

		await setTimeout(5_000);

		await worker.readUntil(/Unexpected error building Functions directory/);

		// And then make sure Wrangler hasn't crashed
		await helper.seed({
			"functions/_middleware.js": dedent`
					export async function onRequest() {
						return new Response("Updated Worker!")
					}`,
		});
		await worker.waitForReload();

		await expect(
			fetch(url).then((r) => r.text())
		).resolves.toMatchInlineSnapshot('"Updated Worker!"');
	});

	it("should support modifying _routes.json during dev session", async () => {
		const helper = new WranglerE2ETestHelper();
		await helper.seed({
			"_worker.js": dedent`
					export default {
						async fetch(request, env) {
							const url = new URL(request.url);
							if (url.pathname === "/foo") {
								return new Response("foo");
							}
							if (url.pathname === "/bar") {
								return new Response("bar");
							}
							return new Response("Hello _routes.json")
						}
					}`,
			"_routes.json": dedent`
				{
					"version": 1,
					"include": ["/foo", "/bar"],
					"exclude": []
				}
			`,
			"index.html": dedent`
				hello world
			`,
		});
		const port = await getPort();
		const worker = helper.runLongLived(`wrangler pages dev --port ${port} .`);
		const { url } = await worker.waitForReady();

		const foo = await fetchText(`${url}/foo`);
		expect(foo).toMatchInlineSnapshot('"foo"');

		const bar = await fetchText(`${url}/bar`);
		expect(bar).toMatchInlineSnapshot('"bar"');

		await helper.seed({
			"_routes.json": dedent`
				{
					"version": 1,
					"include": ["/foo"],
					"exclude": ["/bar"]
				}
			`,
		});
		await worker.waitForReload();

		const foo2 = await fetchText(`${url}/foo`);
		expect(foo2).toMatchInlineSnapshot('"foo"');

		const bar2 = await fetchText(`${url}/bar`);
		expect(bar2).toMatchInlineSnapshot('"hello world"');
	});

	it("should validate _routes.json during dev session, and fallback to default value", async () => {
		const helper = new WranglerE2ETestHelper();
		await helper.seed({
			"functions/foo.ts": dedent`
					export async function onRequest() {
						return new Response("FOO");
					}`,
			"_routes.json": dedent`
					{
						"version": 1,
						"include": ["/foo"],
						"exclude": []
					}
				`,
		});
		const port = await getPort();
		const worker = helper.runLongLived(`wrangler pages dev --port ${port} .`);

		const { url } = await worker.waitForReady();

		const foo = await fetchText(`${url}/foo`);

		expect(foo).toMatchInlineSnapshot('"FOO"');

		// invalid _routes.json because include rule does not start with `/`
		await helper.seed({
			"_routes.json": dedent`
					{
						"version": 1,
						"include": ["foo"],
						"exclude": []
					}
				`,
		});

		await worker.readUntil(/FatalError: Invalid _routes.json file found/);
		await worker.readUntil(/All rules must start with '\/'/);
	});

	it("should use top-level configuration specified in `wrangler.toml`", async () => {
		const helper = new WranglerE2ETestHelper();
		const port = await getPort();
		const worker = helper.runLongLived(`wrangler pages dev --port ${port}`);
		await helper.seed({
			"public/_worker.js": dedent`
						export default {
							async fetch(request, env) {
								return new Response(env.PAGES + " " + "supports wrangler.toml")
							}
						}`,
			"wrangler.toml": dedent`
					name = "pages-project"
					pages_build_output_dir = "public"
					# commenting this out would result in a warning. If there is no "compatibility_date"
					# related warning in stdout, then this value was picked up
					compatibility_date = "2023-01-01"

					[vars]
					PAGES = "⚡️ Pages ⚡️"

					[[kv_namespaces]]
					binding = "KV_BINDING_TOML"
					id = "KV_ID_TOML"
				`,
		});
		const { url } = await worker.waitForReady();

		const text = await fetchText(url);

		expect(text).toMatchInlineSnapshot(
			'"⚡️ Pages ⚡️ supports wrangler.toml"'
		);
		expect(normalizeOutput(worker.currentOutput).replace(/\s/g, "")).toContain(
			`
					Your worker has access to the following bindings:
					- KV Namespaces:
						- KV_BINDING_TOML: KV_ID_TOML
					- Vars:
						- PAGES: "⚡️ Pages ⚡️"
				`.replace(/\s/g, "")
		);
	});

	it("should merge (with override) `wrangler.toml` configuration with configuration provided via the command line, with command line args taking precedence", async () => {
		const helper = new WranglerE2ETestHelper();
		const port = await getPort();

		const flags = [
			` --binding VAR1=NEW_VAR_1 VAR3=VAR_3_ARGS`,
			` --kv KV_BINDING_1_TOML=NEW_KV_ID_1 KV_BINDING_3_ARGS=KV_ID_3_ARGS`,
			` --do DO_BINDING_1_TOML=NEW_DO_1@NEW_DO_SCRIPT_1 DO_BINDING_3_ARGS=DO_3_ARGS@DO_SCRIPT_3_ARGS`,
			` --d1 D1_BINDING_1_TOML=NEW_D1_NAME_1 D1_BINDING_3_ARGS=D1_NAME_3_ARGS`,
			` --r2 R2_BINDING_1_TOML=NEW_R2_BUCKET_1 R2_BINDING_3_TOML=R2_BUCKET_3_ARGS`,
			` --service SERVICE_BINDING_1_TOML=NEW_SERVICE_NAME_1 SERVICE_BINDING_3_TOML=SERVICE_NAME_3_ARGS`,
			` --ai AI_BINDING_2_TOML`,
			` --port ${port}`,
		];
		const worker = helper.runLongLived(`wrangler pages dev ${flags.join("")}`);
		await helper.seed({
			"public/_worker.js": dedent`
					export default {
						async fetch(request, env) {
							return new Response("Pages supports wrangler.toml ⚡️")
						}
					}`,
			"wrangler.toml": dedent`
				name = "pages-project"
				pages_build_output_dir = "public"
				compatibility_date = "2023-01-01"

				[vars]
				VAR1 = "VAR_1_TOML" # to override
				VAR2 = "VAR_2_TOML" # to merge

				# to override
				[[kv_namespaces]]
				binding = "KV_BINDING_1_TOML"
				id = "KV_ID_1_TOML"

				# to merge as is
				[[kv_namespaces]]
				binding = "KV_BINDING_2_TOML"
				id = "KV_ID_2_TOML"

				# to override
				[[durable_objects.bindings]]
				name = "DO_BINDING_1_TOML"
				class_name = "DO_1_TOML"
				script_name = "DO_SCRIPT_1_TOML"

				# to merge as is
				[[durable_objects.bindings]]
				name = "DO_BINDING_2_TOML"
				class_name = "DO_2_TOML"
				script_name = "DO_SCRIPT_2_TOML"

				# to override
				[[d1_databases]]
				binding = "D1_BINDING_1_TOML"
				database_id = "D1_ID_1_TOML"
				database_name = "D1_NAME_1_TOML"

				# to merge as is
				[[d1_databases]]
				binding = "D1_BINDING_2_TOML"
				database_id = "D1_ID_2_TOML"
				database_name = "D1_NAME_2_TOML"

				# to override
				[[r2_buckets]]
				binding = 'R2_BINDING_1_TOML'
				bucket_name = 'R2_BUCKET_1_TOML'

				# to merge as is
				[[r2_buckets]]
				binding = 'R2_BINDING_2_TOML'
				bucket_name = 'R2_BUCKET_2_TOML'

				# to override
				[[services]]
				binding = "SERVICE_BINDING_1_TOML"
				service = "SERVICE_NAME_1_TOML"

				# to merge as is
				[[services]]
				binding = "SERVICE_BINDING_2_TOML"
				service = "SERVICE_NAME_2_TOML"

				# to override
				[ai]
				binding = "AI_BINDING_1_TOML"
			`,
		});
		await worker.waitForReady();

		// We only care about the list of bindings and warnings, so strip other output
		const [prestartOutput] = normalizeOutput(worker.currentOutput).split(
			"⎔ Starting local server..."
		);

		expect(prestartOutput).toMatchInlineSnapshot(`
				"✨ Compiled Worker successfully
				▲ [WARNING] WARNING: You have Durable Object bindings that are not defined locally in the worker being developed.
				  Be aware that changes to the data stored in these Durable Objects will be permanent and affect the live instances.
				  Remote Durable Objects that are affected:
				  - {"name":"DO_BINDING_1_TOML","class_name":"DO_1_TOML","script_name":"DO_SCRIPT_1_TOML"}
				  - {"name":"DO_BINDING_2_TOML","class_name":"DO_2_TOML","script_name":"DO_SCRIPT_2_TOML"}
				▲ [WARNING] This worker is bound to live services: SERVICE_BINDING_1_TOML (SERVICE_NAME_1_TOML), SERVICE_BINDING_2_TOML (SERVICE_NAME_2_TOML)
				Your worker has access to the following bindings:
				- Durable Objects:
				  - DO_BINDING_1_TOML: NEW_DO_1 (defined in NEW_DO_SCRIPT_1)
				  - DO_BINDING_2_TOML: DO_2_TOML (defined in DO_SCRIPT_2_TOML)
				  - DO_BINDING_3_ARGS: DO_3_ARGS (defined in DO_SCRIPT_3_ARGS)
				- KV Namespaces:
				  - KV_BINDING_1_TOML: NEW_KV_ID_1
				  - KV_BINDING_2_TOML: KV_ID_2_TOML
				  - KV_BINDING_3_ARGS: KV_ID_3_ARGS
				- D1 Databases:
				  - D1_BINDING_1_TOML: local-D1_BINDING_1_TOML=NEW_D1_NAME_1 (NEW_D1_NAME_1)
				  - D1_BINDING_2_TOML: D1_NAME_2_TOML (D1_ID_2_TOML)
				  - D1_BINDING_3_ARGS: local-D1_BINDING_3_ARGS=D1_NAME_3_ARGS (D1_NAME_3_ARGS)
				- R2 Buckets:
				  - R2_BINDING_1_TOML: NEW_R2_BUCKET_1
				  - R2_BINDING_2_TOML: R2_BUCKET_2_TOML
				  - R2_BINDING_3_TOML: R2_BUCKET_3_ARGS
				- Services:
				  - SERVICE_BINDING_1_TOML: NEW_SERVICE_NAME_1
				  - SERVICE_BINDING_2_TOML: SERVICE_NAME_2_TOML
				  - SERVICE_BINDING_3_TOML: SERVICE_NAME_3_ARGS
				- AI:
				  - Name: AI_BINDING_2_TOML
				- Vars:
				  - VAR1: "(hidden)"
				  - VAR2: "VAR_2_TOML"
				  - VAR3: "(hidden)"
				▲ [WARNING] ⎔ Support for service bindings in local mode is experimental and may change.
				▲ [WARNING] ⎔ Support for external Durable Objects in local mode is experimental and may change.
				"
			`);
	});

	it("should pick up wrangler.toml configuration even in cases when `pages_build_output_dir` was not specified, but the <directory> command argument was", async () => {
		const helper = new WranglerE2ETestHelper();
		await helper.seed({
			"public/_worker.js": dedent`
					export default {
						async fetch(request, env) {
							return new Response(env.PAGES_EMOJI + " Pages supports wrangler.toml" + " " + env.PAGES_EMOJI)
						}
					}`,
			"wrangler.toml": dedent`
				name = "pages-project"
				compatibility_date = "2023-01-01"

				[vars]
				PAGES_EMOJI = "⚡️"
			`,
		});
		const port = await getPort();
		const worker = helper.runLongLived(
			`wrangler pages dev --port ${port} public`
		);
		const { url } = await worker.waitForReady();
		await expect(fetchText(url)).resolves.toMatchInlineSnapshot(
			`"⚡️ Pages supports wrangler.toml ⚡️"`
		);
	});
});
