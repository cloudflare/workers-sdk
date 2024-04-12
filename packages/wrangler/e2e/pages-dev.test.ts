import crypto from "node:crypto";
import path from "node:path";
import { setTimeout } from "node:timers/promises";
import getPort from "get-port";
import shellac from "shellac";
import dedent from "ts-dedent";
import { fetch } from "undici";
import { beforeEach, describe, expect, it } from "vitest";
import { normalizeOutput } from "./helpers/normalize";
import { retry } from "./helpers/retry";
import { makeRoot, seed } from "./helpers/setup";
import { WRANGLER } from "./helpers/wrangler";

type MaybePromise<T = void> = T | Promise<T>;

interface SessionData {
	port: number;
	stdout: string;
	stderr: string;
}

const waitUntilOutputContains = async (
	session: SessionData,
	substring: string,
	intervalMs = 100
) => {
	await retry(
		(stdout) => !stdout.includes(substring),
		async () => {
			await setTimeout(intervalMs);
			return session.stdout + "\n\n\n" + session.stderr;
		}
	);
};

async function runDevSession(
	workerPath: string,
	flags: string,
	session: (sessionData: SessionData) => MaybePromise
) {
	let pid;
	try {
		const portFlagMatch = flags.match(/--port (\d+)/);
		let port = 0;
		if (portFlagMatch) {
			port = parseInt(portFlagMatch[1]);
		}
		if (port === 0) {
			port = await getPort();
			flags += ` --port ${port}`;
		}

		// Must use the `in` statement in the shellac script rather than `.in()` modifier on the `shellac` object
		// otherwise the working directory does not get picked up.
		let promiseResolve: (() => void) | undefined;
		const promise = new Promise<void>((resolve) => (promiseResolve = resolve));
		const bg = await shellac.env(process.env).bg`
		await ${() => promise}

		in ${workerPath} {
			exits {
				$ ${WRANGLER} pages dev ${flags}
			}
		}
			`;

		pid = bg.pid;

		// sessionData is a mutable object where stdout/stderr update
		const sessionData: SessionData = {
			port,
			stdout: "",
			stderr: "",
		};

		bg.process.stdout.on("data", (chunk) => (sessionData.stdout += chunk));
		bg.process.stderr.on("data", (chunk) => (sessionData.stderr += chunk));
		// Only start `wrangler pages dev` once we've registered output listeners so we don't miss messages
		promiseResolve?.();

		await session(sessionData);

		return bg.promise;
	} finally {
		if (pid) process.kill(pid);
	}
}

describe("pages dev", () => {
	let workerName: string;
	let workerPath: string;

	beforeEach(async () => {
		const root = await makeRoot();
		workerName = `tmp-e2e-wrangler-${crypto.randomBytes(4).toString("hex")}`;
		workerPath = path.join(root, workerName);
		await seed(workerPath, {
			"package.json": dedent`
					{
						"name": "${workerName}",
						"version": "0.0.0",
						"private": true
					}
					`,
		});
	});

	it("should warn if no [--compatibility_date] command line arg was specified", async () => {
		await runDevSession(workerPath, ".", async (session) => {
			await seed(workerPath, {
				"_worker.js": dedent`
						export default {
							fetch(request, env) {
								return new Response("Testing [--compatibility_date]")
							}
						}`,
			});
			const { text, stderr } = await retry(
				(s) => s.status !== 200,
				async () => {
					const r = await fetch(`http://127.0.0.1:${session.port}`);
					return {
						text: await r.text(),
						status: r.status,
						stderr: session.stderr,
					};
				}
			);

			const currentDate = new Date().toISOString().substring(0, 10);
			expect(text).toMatchInlineSnapshot('"Testing [--compatibility_date]"');
			expect(normalizeOutput(stderr).replaceAll(currentDate, "<current-date>"))
				.toMatchInlineSnapshot(`
				"▲ [WARNING] No compatibility_date was specified. Using today's date: <current-date>.
				  Pass it in your terminal:
				  \`\`\`
				  --compatibility-date=<current-date>
				  \`\`\`
				  See https://developers.cloudflare.com/workers/platform/compatibility-dates/ for more information."
			`);
		});
	});

	it("should warn that [--experimental-local] is no longer required, if specified", async () => {
		await runDevSession(
			workerPath,
			". --experimental-local",
			async (session) => {
				await seed(workerPath, {
					"_worker.js": dedent`
						export default {
							fetch(request, env) {
								return new Response("Testing [--experimental-local]")
							}
						}`,
				});
				const { text, stderr } = await retry(
					(s) => s.status !== 200,
					async () => {
						const r = await fetch(`http://127.0.0.1:${session.port}`);
						return {
							text: await r.text(),
							status: r.status,
							stderr: session.stderr,
						};
					}
				);

				const currentDate = new Date().toISOString().substring(0, 10);
				expect(text).toMatchInlineSnapshot('"Testing [--experimental-local]"');
				expect(
					normalizeOutput(stderr).replaceAll(currentDate, "<current-date>")
				).toMatchInlineSnapshot(`
				"▲ [WARNING] --experimental-local is no longer required and will be removed in a future version.
				  \`wrangler pages dev\` now uses the local Cloudflare Workers runtime by default.
				▲ [WARNING] No compatibility_date was specified. Using today's date: <current-date>.
				  Pass it in your terminal:
				  \`\`\`
				  --compatibility-date=<current-date>
				  \`\`\`
				  See https://developers.cloudflare.com/workers/platform/compatibility-dates/ for more information."
			`);
			}
		);
	});

	it("should show [--service] related warnings if specified as arg in the command line", async () => {
		await runDevSession(
			workerPath,
			". --service STAGING_SERVICE=test-worker@staging",
			async (session) => {
				await waitUntilOutputContains(session, "WARNING");

				const normalizedOutput = normalizeOutput(session.stderr);
				expect(normalizedOutput).toContain(
					`[WARNING] Support for service binding environments is experimental.`
				);
				expect(normalizedOutput).toContain(
					`[WARNING] ⎔ Support for service bindings in local mode is experimental and may change.`
				);
			}
		);
	});

	it("should warn if bindings specified as args in the command line are invalid", async () => {
		await runDevSession(
			workerPath,
			". --service test --kv = --do test --d1 = --r2 =",
			async (session) => {
				await waitUntilOutputContains(session, "WARNING");

				const normalizedOutput = normalizeOutput(session.stderr);
				expect(normalizedOutput).toContain(
					`[WARNING] Could not parse Service binding: test`
				);
				expect(normalizedOutput).toContain(
					`[WARNING] Could not parse KV binding: =`
				);
				expect(normalizedOutput).toContain(
					`[WARNING] Could not parse Durable Object binding: test`
				);
				expect(normalizedOutput).toContain(
					`[WARNING] Could not parse R2 binding: =`
				);
				expect(normalizedOutput).toContain(
					`[WARNING] Could not parse D1 binding: =`
				);
			}
		);
	});

	it("should use bindings specified as args in the command line", async () => {
		await runDevSession(
			workerPath,
			". --service TEST_SERVICE=test-worker --kv TEST_KV --do TEST_DO=TestDurableObject@a --d1 TEST_D1 --r2 TEST_R2",
			async (session) => {
				await seed(workerPath, {
					"_worker.js": dedent`
							export default {
								fetch(request, env) {
									return new Response("Hello world")
								}
							}`,
				});

				await waitUntilOutputContains(
					session,
					"Your worker has access to the following bindings:"
				);

				expect(normalizeOutput(session.stdout).replace(/\s/g, "")).toContain(
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
	});

	it("should modify worker during dev session (_worker)", async () => {
		await runDevSession(workerPath, ".", async (session) => {
			await seed(workerPath, {
				"_worker.js": dedent`
						export default {
							fetch(request, env) {
								return new Response("Hello World!")
							}
						}`,
			});
			const { text } = await retry(
				(s) => s.status !== 200,
				async () => {
					const r = await fetch(`http://127.0.0.1:${session.port}`);
					return { text: await r.text(), status: r.status };
				}
			);
			expect(text).toMatchInlineSnapshot('"Hello World!"');

			await seed(workerPath, {
				"_worker.js": dedent`
						export default {
							fetch(request, env) {
								return new Response("Updated Worker!")
							}
						}`,
			});

			const { text: text2 } = await retry(
				(s) => s.status !== 200 || s.text === "Hello World!",
				async () => {
					const r = await fetch(`http://127.0.0.1:${session.port}`);
					return { text: await r.text(), status: r.status };
				}
			);
			expect(text2).toMatchInlineSnapshot('"Updated Worker!"');
		});
	});

	it("should modify worker during dev session (Functions)", async () => {
		await runDevSession(workerPath, ".", async (session) => {
			await seed(workerPath, {
				"functions/_middleware.js": dedent`
						export async function onRequest() {
							return new Response("Hello World!")
						}`,
			});
			const { text } = await retry(
				(s) => s.status !== 200,
				async () => {
					const r = await fetch(`http://127.0.0.1:${session.port}`);
					return { text: await r.text(), status: r.status };
				}
			);
			expect(text).toMatchInlineSnapshot('"Hello World!"');

			await seed(workerPath, {
				"functions/_middleware.js": dedent`
						export async function onRequest() {
							return new Response("Updated Worker!")
						}`,
			});

			const { text: text2 } = await retry(
				(s) => s.status !== 200 || s.text === "Hello World!",
				async () => {
					const r = await fetch(`http://127.0.0.1:${session.port}`);
					return { text: await r.text(), status: r.status };
				}
			);
			expect(text2).toMatchInlineSnapshot('"Updated Worker!"');
		});
	});

	it("should recover from syntax error during dev session (_worker)", async () => {
		const out = await runDevSession(workerPath, ".", async (session) => {
			await seed(workerPath, {
				"_worker.js": dedent`
						export default {
							fetch(request, env) {
								return new Response("Hello World!")
							}
						}`,
			});
			const { text } = await retry(
				(s) => s.status !== 200,
				async () => {
					const r = await fetch(`http://127.0.0.1:${session.port}`);
					return { text: await r.text(), status: r.status };
				}
			);
			expect(text).toMatchInlineSnapshot('"Hello World!"');
			await seed(workerPath, {
				"_worker.js": dedent`
						export default {
							fetch(request, env) {
								return new Response("Updated Worker!")
							} // Syntax Error
							}
						}`,
			});

			// Make sure the syntax error above is picked up
			await setTimeout(5_000);

			// And then make sure Wrangler hasn't crashed
			await seed(workerPath, {
				"_worker.js": dedent`
						export default {
							fetch(request, env) {
								return new Response("Updated Worker!")
							}
						}`,
			});

			const { text: text2 } = await retry(
				(s) => s.status !== 200 || s.text === "Hello World!",
				async () => {
					const r = await fetch(`http://127.0.0.1:${session.port}`);
					return { text: await r.text(), status: r.status };
				}
			);
			expect(text2).toMatchInlineSnapshot('"Updated Worker!"');
		});
		expect(out.stderr).toContain("Failed to bundle");
	});

	it("should recover from syntax error during dev session (Functions)", async () => {
		const out = await runDevSession(workerPath, ".", async (session) => {
			await seed(workerPath, {
				"functions/_middleware.js": dedent`
						export async function onRequest() {
							return new Response("Hello World!")
						}`,
			});
			const { text } = await retry(
				(s) => s.status !== 200,
				async () => {
					const r = await fetch(`http://127.0.0.1:${session.port}`);
					return { text: await r.text(), status: r.status };
				}
			);
			expect(text).toMatchInlineSnapshot('"Hello World!"');
			await seed(workerPath, {
				"functions/_middleware.js": dedent`
						export async function onRequest() {
							return new Response("Updated Worker!")
							} // Syntax Error
						}`,
			});

			// Make sure the syntax error above is picked up
			await setTimeout(5_000);

			// And then make sure Wrangler hasn't crashed
			await seed(workerPath, {
				"functions/_middleware.js": dedent`
						export async function onRequest() {
							return new Response("Updated Worker!")
						}`,
			});

			const { text: text2 } = await retry(
				(s) => s.status !== 200 || s.text === "Hello World!",
				async () => {
					const r = await fetch(`http://127.0.0.1:${session.port}`);
					return { text: await r.text(), status: r.status };
				}
			);
			expect(text2).toMatchInlineSnapshot('"Updated Worker!"');
		});
		expect(out.stderr).toContain(
			"Unexpected error building Functions directory"
		);
	});

	it("should support modifying _routes.json during dev session", async () => {
		await runDevSession(workerPath, ".", async (session) => {
			await seed(workerPath, {
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

			const { text: foo } = await retry(
				(s) => s.status !== 200,
				async () => {
					const r = await fetch(`http://127.0.0.1:${session.port}/foo`);
					return { text: await r.text(), status: r.status };
				}
			);
			expect(foo).toMatchInlineSnapshot('"foo"');

			const { text: bar } = await retry(
				(s) => s.status !== 200 || s.text === "foo",
				async () => {
					const r = await fetch(`http://127.0.0.1:${session.port}/bar`);
					return { text: await r.text(), status: r.status };
				}
			);
			expect(bar).toMatchInlineSnapshot('"bar"');

			await seed(workerPath, {
				"_routes.json": dedent`
					{
						"version": 1,
						"include": ["/foo"],
						"exclude": ["/bar"]
					}
				`,
			});

			// Give a bit of time for the change to propagate.
			await setTimeout(5000);

			const { text: foo2 } = await retry(
				(s) => s.status !== 200 || s.text === "bar",
				async () => {
					const r = await fetch(`http://127.0.0.1:${session.port}/foo`);
					return { text: await r.text(), status: r.status };
				}
			);
			expect(foo2).toMatchInlineSnapshot('"foo"');

			const { text: bar2 } = await retry(
				(s) => s.status !== 200 || s.text === "foo",
				async () => {
					const r = await fetch(`http://127.0.0.1:${session.port}/bar`);
					return { text: await r.text(), status: r.status };
				}
			);
			expect(bar2).toMatchInlineSnapshot('"hello world"');
		});
	});

	it("should validate _routes.json during dev session, and fallback to default value", async () => {
		await runDevSession(workerPath, ".", async (session) => {
			await seed(workerPath, {
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

			const { text: foo } = await retry(
				(s) => s.status !== 200,
				async () => {
					const r = await fetch(`http://127.0.0.1:${session.port}/foo`);
					return { text: await r.text(), status: r.status };
				}
			);
			expect(foo).toMatchInlineSnapshot('"FOO"');

			// invalid _routes.json because include rule does not start with `/`
			await seed(workerPath, {
				"_routes.json": dedent`
					{
						"version": 1,
						"include": ["foo"],
						"exclude": []
					}
				`,
			});

			const { stderr } = await retry(
				(s) => !s.stderr.includes("ERROR"),
				() => {
					return { stderr: session.stderr };
				}
			);

			const normalizedStderr = normalizeOutput(stderr);
			expect(normalizedStderr).toContain(
				"[ERROR] FatalError: Invalid _routes.json file found"
			);
			expect(normalizedStderr).toContain("All rules must start with '/'.");
			expect(normalizedStderr).toContain(
				"[WARNING] Falling back to the following _routes.json default"
			);
		});
	});

	it("should support wrangler.toml", async () => {
		await runDevSession(workerPath, "", async (session) => {
			await seed(workerPath, {
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

			const { text, stderr } = await retry(
				(s) => s.status !== 200,
				async () => {
					const r = await fetch(`http://127.0.0.1:${session.port}`);
					return {
						text: await r.text(),
						status: r.status,
						stderr: session.stderr,
					};
				}
			);
			expect(normalizeOutput(stderr)).toMatchInlineSnapshot(`""`);
			expect(text).toMatchInlineSnapshot(
				'"Pages supports wrangler.toml ⚡️⚡️"'
			);
		});
	});

	it("should use top-level configuration specified in `wrangler.toml`", async () => {
		await runDevSession(workerPath, "", async (session) => {
			await seed(workerPath, {
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

			const { text, stdout, stderr } = await retry(
				(s) => s.status !== 200,
				async () => {
					const r = await fetch(`http://127.0.0.1:${session.port}`);
					return {
						text: await r.text(),
						status: r.status,
						stdout: session.stdout,
						stderr: session.stderr,
					};
				}
			);

			expect(text).toMatchInlineSnapshot(
				'"⚡️ Pages ⚡️ supports wrangler.toml"'
			);
			expect(normalizeOutput(stderr)).toMatchInlineSnapshot(`""`);
			expect(normalizeOutput(stdout).replace(/\s/g, "")).toContain(
				`
					Your worker has access to the following bindings:
					- KV Namespaces:
						- KV_BINDING_TOML: KV_ID_TOML
					- Vars:
						- PAGES: "⚡️ Pages ⚡️"
				`.replace(/\s/g, "")
			);
		});
	});

	it("should merge (with override) `wrangler.toml` configuration with configuration provided via the command line, with command line args taking precedence", async () => {
		const flags = [
			` --binding VAR1=NEW_VAR_1 VAR3=VAR_3_ARGS`,
			` --kv KV_BINDING_1_TOML=NEW_KV_ID_1 KV_BINDING_3_ARGS=KV_ID_3_ARGS`,
			` --do DO_BINDING_1_TOML=NEW_DO_1@NEW_DO_SCRIPT_1 DO_BINDING_3_ARGS=DO_3_ARGS@DO_SCRIPT_3_ARGS`,
			` --d1 D1_BINDING_1_TOML=NEW_D1_NAME_1 D1_BINDING_3_ARGS=D1_NAME_3_ARGS`,
			` --r2 R2_BINDING_1_TOML=NEW_R2_BUCKET_1 R2_BINDING_3_TOML=R2_BUCKET_3_ARGS`,
			` --service SERVICE_BINDING_1_TOML=NEW_SERVICE_NAME_1 SERVICE_BINDING_3_TOML=SERVICE_NAME_3_ARGS`,
			` --ai AI_BINDING_2_TOML`,
		];
		await runDevSession(workerPath, `${flags}`, async (session) => {
			await seed(workerPath, {
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

			const { text, stdout, stderr } = await retry(
				(s) => s.status !== 200,
				async () => {
					const r = await fetch(`http://127.0.0.1:${session.port}`);
					return {
						text: await r.text(),
						status: r.status,
						stdout: session.stdout,
						stderr: session.stderr,
					};
				}
			);

			expect(text).toMatchInlineSnapshot('"Pages supports wrangler.toml ⚡️"');
			expect(normalizeOutput(stderr)).toMatchInlineSnapshot(`
				"▲ [WARNING] WARNING: You have Durable Object bindings that are not defined locally in the worker being developed.
				  Be aware that changes to the data stored in these Durable Objects will be permanent and affect the live instances.
				  Remote Durable Objects that are affected:
				  - {"name":"DO_BINDING_1_TOML","class_name":"DO_1_TOML","script_name":"DO_SCRIPT_1_TOML"}
				  - {"name":"DO_BINDING_2_TOML","class_name":"DO_2_TOML","script_name":"DO_SCRIPT_2_TOML"}
				▲ [WARNING] This worker is bound to live services: SERVICE_BINDING_1_TOML (SERVICE_NAME_1_TOML), SERVICE_BINDING_2_TOML (SERVICE_NAME_2_TOML)
				▲ [WARNING] ⎔ Support for service bindings in local mode is experimental and may change.
				▲ [WARNING] ⎔ Support for external Durable Objects in local mode is experimental and may change.
				▲ [WARNING] Using Workers AI always accesses your Cloudflare account in order to run AI models, and so will incur usage charges even in local development."
			`);
			expect(normalizeOutput(stdout).replace(/\s/g, "")).toContain(
				`
				Your worker has access to the following bindings:
				- Durable Objects:
				  - DO_BINDING_1_TOML: NEW_DO_1 (defined in NEW_DO_SCRIPT_1)
				  - DO_BINDING_2_TOML: DO_2_TOML (defined in DO_SCRIPT_2_TOML)
				  - DO_BINDING_3_ARGS: DO_3_ARGS (defined in DO_SCRIPT_3_ARGS,)
				- KV Namespaces:
				  - KV_BINDING_1_TOML: NEW_KV_ID_1
				  - KV_BINDING_2_TOML: KV_ID_2_TOML
				  - KV_BINDING_3_ARGS: KV_ID_3_ARGS,
				- D1 Databases:
				  - D1_BINDING_1_TOML: local-D1_BINDING_1_TOML=NEW_D1_NAME_1 (NEW_D1_NAME_1)
				  - D1_BINDING_2_TOML: D1_NAME_2_TOML (D1_ID_2_TOML)
				  - D1_BINDING_3_ARGS: local-D1_BINDING_3_ARGS=D1_NAME_3_ARGS, (D1_NAME_3_ARGS,)
				- R2 Buckets:
				  - R2_BINDING_1_TOML: NEW_R2_BUCKET_1
				  - R2_BINDING_2_TOML: R2_BUCKET_2_TOML
				  - R2_BINDING_3_TOML: R2_BUCKET_3_ARGS,
				- Services:
				  - SERVICE_BINDING_1_TOML: NEW_SERVICE_NAME_1
				  - SERVICE_BINDING_2_TOML: SERVICE_NAME_2_TOML
				  - SERVICE_BINDING_3_TOML: SERVICE_NAME_3_ARGS,
				- AI:
				  - Name: AI_BINDING_2_TOML
				- Vars:
				  - VAR1: "(hidden)"
				  - VAR2: "VAR_2_TOML"
				  - VAR3: "(hidden)
			`.replace(/\s/g, "")
			);
		});
	});

	it("should pick up wrangler.toml configuration even in cases when `pages_build_output_dir` was not specified, but the <directory> command argument was", async () => {
		await runDevSession(workerPath, "public", async (session) => {
			await seed(workerPath, {
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

			const { text, stderr } = await retry(
				(s) => s.status !== 200,
				async () => {
					const r = await fetch(`http://127.0.0.1:${session.port}`);
					return {
						text: await r.text(),
						status: r.status,
						stderr: session.stderr,
					};
				}
			);
			expect(normalizeOutput(stderr)).toMatchInlineSnapshot(`""`);
			expect(text).toMatchInlineSnapshot(
				'"⚡️ Pages supports wrangler.toml ⚡️"'
			);
		});
	});
});
