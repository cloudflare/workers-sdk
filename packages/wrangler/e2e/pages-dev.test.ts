import getPort from "get-port";
import dedent from "ts-dedent";
import { fetch } from "undici";
import { describe, expect } from "vitest";
import { e2eTest } from "./helpers/e2e-wrangler-test";
import { fetchText } from "./helpers/fetch-text";
import { normalizeOutput } from "./helpers/normalize";
import { waitForReady, waitForReload } from "./helpers/wrangler";

describe("pages dev", () => {
	e2eTest(
		"should warn if no [--compatibility_date] command line arg was specified",
		async ({ seed, run }) => {
			await seed({
				"_worker.js": dedent`
					export default {
						fetch(request, env) {
							return new Response("Testing [--compatibility_date]")
						}
					}`,
			});
			const worker = run(`wrangler pages dev .`);
			const { url } = await waitForReady(worker);
			const text = await fetchText(url);
			expect(text).toMatchInlineSnapshot('"Testing [--compatibility_date]"');
			expect(worker.output).toContain(
				`No compatibility_date was specified. Using today's date`
			);
		}
	);

	e2eTest(
		"should warn that [--experimental-local] is no longer required, if specified",
		async ({ seed, run }) => {
			const worker = run(`wrangler pages dev . --experimental-local`);
			await seed({
				"_worker.js": dedent`
				export default {
					fetch(request, env) {
						return new Response("Testing [--experimental-local]")
					}
				}`,
			});
			const { url } = await waitForReady(worker);
			const text = await fetchText(url);
			expect(text).toMatchInlineSnapshot(`"Testing [--experimental-local]"`);
			expect(worker.output).toContain(
				`--experimental-local is no longer required and will be removed in a future version`
			);
		}
	);

	e2eTest(
		"should show [--service] related warnings if specified as arg in the command line",
		async ({ run }) => {
			const worker = run(
				`wrangler pages dev . --service STAGING_SERVICE=test-worker@staging`
			);

			await worker.readUntil(
				/Support for service binding environments is experimental/
			);
			await worker.readUntil(
				/Support for service bindings in local mode is experimental and may change/
			);
		}
	);

	e2eTest(
		"should warn if bindings specified as args in the command line are invalid",
		async ({ run }) => {
			const port = await getPort();
			const worker = run(
				`wrangler pages dev . --port ${port} --service test --kv = --do test --d1 = --r2 =`
			);
			await waitForReady(worker);
			expect(worker.output).toContain(`Could not parse Service binding: test`);
			expect(worker.output).toContain(`Could not parse KV binding: =`);
			expect(worker.output).toContain(
				`Could not parse Durable Object binding: test`
			);
			expect(worker.output).toContain(`Could not parse R2 binding: =`);
			expect(worker.output).toContain(`Could not parse D1 binding: =`);
		}
	);

	e2eTest(
		"should use bindings specified as args in the command line",
		async ({ run, seed }) => {
			await seed({
				"_worker.js": dedent`
					export default {
						fetch(request, env) {
							return new Response("Hello world")
						}
					}`,
			});
			const port = await getPort();
			const worker = run(
				`wrangler pages dev . --port ${port} --service TEST_SERVICE=test-worker --kv TEST_KV --do TEST_DO=TestDurableObject@a --d1 TEST_D1 --r2 TEST_R2`
			);
			await waitForReady(worker);
			expect(normalizeOutput(worker.output).replace(/\s/g, "")).toContain(
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
		}
	);

	e2eTest(
		"should modify worker during dev session (_worker)",
		async ({ run, seed }) => {
			await seed({
				"_worker.js": dedent`
					export default {
						fetch(request, env) {
							return new Response("Hello World!")
						}
					}`,
			});
			const worker = run(`wrangler pages dev .`);
			const { url } = await waitForReady(worker);

			await expect(
				fetch(url).then((r) => r.text())
			).resolves.toMatchInlineSnapshot('"Hello World!"');

			await seed({
				"_worker.js": dedent`
						export default {
							fetch(request, env) {
								return new Response("Updated Worker!")
							}
						}`,
			});

			await waitForReload(worker);

			await expect(
				fetch(url).then((r) => r.text())
			).resolves.toMatchInlineSnapshot('"Updated Worker!"');
		}
	);

	e2eTest(
		"should modify worker during dev session (Functions)",
		async ({ run, seed }) => {
			const worker = run("wrangler pages dev .");

			await seed({
				"functions/_middleware.js": dedent`
					export async function onRequest() {
						return new Response("Hello World!")
					}`,
			});

			const { url } = await waitForReady(worker);

			await expect(
				fetch(url).then((r) => r.text())
			).resolves.toMatchInlineSnapshot('"Hello World!"');

			await seed({
				"functions/_middleware.js": dedent`
					export async function onRequest() {
						return new Response("Updated Worker!")
					}`,
			});

			await waitForReload(worker);

			await expect(
				fetch(url).then((r) => r.text())
			).resolves.toMatchInlineSnapshot('"Updated Worker!"');
		}
	);
	e2eTest("should support wrangler.toml", async ({ seed, run }) => {
		await seed({
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
		const worker = run(`wrangler pages dev`);
		const { url } = await waitForReady(worker);

		const text = await fetchText(url);
		expect(text).toMatchInlineSnapshot('"Pages supports wrangler.toml ⚡️⚡️"');
	});

	e2eTest(
		"should recover from syntax error during dev session (_worker)",
		async ({ run, seed }) => {
			const worker = run("wrangler pages dev .");

			await seed({
				"_worker.js": dedent`
					export default {
						fetch(request, env) {
							return new Response("Hello World!")
						}
					}`,
			});

			const { url } = await waitForReady(worker);

			await expect(
				fetch(url).then((r) => r.text())
			).resolves.toMatchInlineSnapshot('"Hello World!"');

			await seed({
				"_worker.js": dedent`
					export default {
						fetch(request, env) {
							return new Response("Updated Worker!")
						} // Syntax Error
						}
					}`,
			});

			await worker.readUntil(/Failed to bundle/);

			// And then make sure Wrangler hasn't crashed
			await seed({
				"_worker.js": dedent`
					export default {
						fetch(request, env) {
							return new Response("Updated Worker!")
						}
					}`,
			});
			await waitForReload(worker);

			await expect(
				fetch(url).then((r) => r.text())
			).resolves.toMatchInlineSnapshot('"Updated Worker!"');
		}
	);

	e2eTest(
		"should recover from syntax error during dev session (Functions)",
		async ({ run, seed }) => {
			const worker = run("wrangler pages dev .");

			await seed({
				"functions/_middleware.js": dedent`
					export async function onRequest() {
						return new Response("Hello World!")
					}`,
			});

			const { url } = await waitForReady(worker);

			await expect(
				fetch(url).then((r) => r.text())
			).resolves.toMatchInlineSnapshot('"Hello World!"');

			await seed({
				"functions/_middleware.js": dedent`
						export async function onRequest() {
							return new Response("Updated Worker!")
							} // Syntax Error
						}`,
			});

			await worker.readUntil(/Unexpected error building Functions directory/);

			// And then make sure Wrangler hasn't crashed
			await seed({
				"functions/_middleware.js": dedent`
					export async function onRequest() {
						return new Response("Updated Worker!")
					}`,
			});
			await waitForReload(worker);

			await expect(
				fetch(url).then((r) => r.text())
			).resolves.toMatchInlineSnapshot('"Updated Worker!"');
		}
	);

	e2eTest(
		"should support modifying _routes.json during dev session",
		async ({ run, seed }) => {
			await seed({
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
			const worker = run(`wrangler pages dev .`);
			const { url } = await waitForReady(worker);

			const foo = await fetchText(`${url}/foo`);
			expect(foo).toMatchInlineSnapshot('"foo"');

			const bar = await fetchText(`${url}/bar`);
			expect(bar).toMatchInlineSnapshot('"bar"');

			await seed({
				"_routes.json": dedent`
				{
					"version": 1,
					"include": ["/foo"],
					"exclude": ["/bar"]
				}
			`,
			});
			await waitForReload(worker);

			const foo2 = await fetchText(`${url}/foo`);
			expect(foo2).toMatchInlineSnapshot('"foo"');

			const bar2 = await fetchText(`${url}/bar`);
			expect(bar2).toMatchInlineSnapshot('"hello world"');
		}
	);

	e2eTest(
		"should validate _routes.json during dev session, and fallback to default value",
		async ({ run, seed }) => {
			await seed({
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
			const worker = run(`wrangler pages dev .`);

			const { url } = await waitForReady(worker);

			const foo = await fetchText(`${url}/foo`);

			expect(foo).toMatchInlineSnapshot('"FOO"');

			// invalid _routes.json because include rule does not start with `/`
			await seed({
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
		}
	);

	e2eTest(
		"should use top-level configuration specified in `wrangler.toml`",
		async ({ run, seed }) => {
			const worker = run(`wrangler pages dev`);
			await seed({
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
			const { url } = await waitForReady(worker);

			const text = await fetchText(url);

			expect(text).toMatchInlineSnapshot(
				'"⚡️ Pages ⚡️ supports wrangler.toml"'
			);
			expect(normalizeOutput(worker.output).replace(/\s/g, "")).toContain(
				`
					Your worker has access to the following bindings:
					- KV Namespaces:
						- KV_BINDING_TOML: KV_ID_TOML
					- Vars:
						- PAGES: "⚡️ Pages ⚡️"
				`.replace(/\s/g, "")
			);
		}
	);

	e2eTest(
		"should merge (with override) `wrangler.toml` configuration with configuration provided via the command line, with command line args taking precedence",
		async ({ seed, run }) => {
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
			const worker = run(`wrangler pages dev ${flags.join("")}`);
			await seed({
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
			await waitForReady(worker);

			expect(normalizeOutput(worker.output)).toMatchInlineSnapshot(`
				"▲ [WARNING] WARNING: You have Durable Object bindings that are not defined locally in the worker being developed.
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
				⎔ Starting local server...
				▲ [WARNING] Using Workers AI always accesses your Cloudflare account in order to run AI models, and so will incur usage charges even in local development.
				[wrangler:inf] Ready on http://localhost:<PORT>"
			`);
		}
	);

	e2eTest(
		"should pick up wrangler.toml configuration even in cases when `pages_build_output_dir` was not specified, but the <directory> command argument was",
		async ({ seed, run }) => {
			await seed({
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
			const worker = run(`wrangler pages dev public`);
			const { url } = await waitForReady(worker);
			await expect(fetchText(url)).resolves.toMatchInlineSnapshot(
				`"⚡️ Pages supports wrangler.toml ⚡️"`
			);
		}
	);
});
