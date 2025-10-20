import { execSync } from "child_process";
import * as nodeNet from "node:net";
import dedent from "ts-dedent";
import { beforeEach, describe, expect, it } from "vitest";
import { CLOUDFLARE_ACCOUNT_ID } from "./helpers/account-id";
import { WranglerE2ETestHelper } from "./helpers/e2e-wrangler-test";
import { generateResourceName } from "./helpers/generate-resource-name";
import { makeRoot, seed } from "./helpers/setup";
import { WRANGLER_IMPORT } from "./helpers/wrangler";

describe("getPlatformProxy()", () => {
	describe.skipIf(!CLOUDFLARE_ACCOUNT_ID)("Workers AI", () => {
		let root: string;
		beforeEach(async () => {
			root = makeRoot();

			await seed(root, {
				"wrangler.toml": dedent`
						name = "ai-app"
						account_id = "${CLOUDFLARE_ACCOUNT_ID}"
						compatibility_date = "2023-01-01"
						compatibility_flags = ["nodejs_compat"]

						[ai]
						binding = "AI"
				`,
				"index.mjs": dedent/*javascript*/ `
						import { getPlatformProxy } from "${WRANGLER_IMPORT}"

						const { env } = await getPlatformProxy();
						const messages = [
							{
								role: "user",
								// Doing snapshot testing against AI responses can be flaky, but this prompt generates the same output relatively reliably
								content: "Respond with the exact text 'This is a response from Workers AI.'. Do not include any other text",
							},
						];

						const content = await env.AI.run("@cf/meta/llama-3.1-8b-instruct-fast", {
							messages,
						});

						console.log(content.response);

						process.exit(0);
						`,
				"package.json": dedent`
						{
							"name": "ai-app",
							"version": "0.0.0",
							"private": true
						}
						`,
			});
		});
		it("can run ai inference", async () => {
			const stdout = execSync(`node index.mjs`, {
				cwd: root,
				encoding: "utf-8",
			});
			expect(stdout).toContain("Workers AI");
		});
	});

	describe("multi worker", () => {
		let app: string;
		let worker: string;
		let workerName: string;
		let helper: WranglerE2ETestHelper;

		beforeEach(async () => {
			workerName = generateResourceName("worker");
			helper = new WranglerE2ETestHelper();

			app = makeRoot();

			await seed(app, {
				"wrangler.toml": dedent`
						name = "app"
						account_id = "${CLOUDFLARE_ACCOUNT_ID}"
						compatibility_date = "2023-01-01"
						compatibility_flags = ["nodejs_compat"]

						[[services]]
						binding = "WORKER"
						service = '${workerName}'
				`,
				"package.json": dedent`
						{
							"name": "app",
							"version": "0.0.0",
							"private": true
						}
						`,
			});

			worker = await makeRoot();
			await seed(worker, {
				"wrangler.toml": dedent`
							name = "${workerName}"
							main = "src/index.ts"
							compatibility_date = "2023-01-01"
					`,
				"src/index.ts": dedent/* javascript */ `
						export default {
							fetch(req, env) {
								return new Response("Hello from Worker!")
							},
						};
						`,
				"package.json": dedent`
							{
								"name": "${workerName}",
								"version": "0.0.0",
								"private": true
							}
							`,
			});
		});

		async function runInNode(code: string) {
			const w = helper.runLongLived("wrangler dev", {
				cwd: worker,
			});

			await w.waitForReady();

			await seed(app, {
				"index.mjs": dedent/*javascript*/ `
						import { getPlatformProxy } from "${WRANGLER_IMPORT}"

						const { env } = await getPlatformProxy();

						const resp = ${code}

						console.log(resp);

						process.exit(0);
						`,
			});
			const stdout = execSync(`node index.mjs`, {
				cwd: app,
				encoding: "utf-8",
			});
			return stdout;
		}

		it("can fetch service binding", async () => {
			await expect(
				runInNode(
					/* javascript */ `await env.WORKER.fetch("http://example.com/").then(r => r.text())`
				)
			).resolves.toContain("Hello from Worker");
		});

		it("can fetch durable object", async () => {
			await seed(app, {
				"wrangler.toml": dedent`
						name = "app"
						account_id = "${CLOUDFLARE_ACCOUNT_ID}"
						compatibility_date = "2023-01-01"
						compatibility_flags = ["nodejs_compat"]

						[durable_objects]
						bindings = [
							{ name = "DO", script_name = "${workerName}", class_name = "DurableObjectClass" },
						]
				`,
			});
			await seed(worker, {
				"src/index.ts": dedent/* javascript */ `
					import { DurableObject } from "cloudflare:workers";
					export default {
						async fetch(): Promise<Response> {
							return new Response("Hello World from do-worker");
						},
					};

					export class DurableObjectClass extends DurableObject {
						async fetch() {
							return new Response("Hello from DurableObject");
						}
					}
				`,
				"wrangler.toml": dedent`
						name = "${workerName}"
						main = "src/index.ts"
						compatibility_date = "2023-01-01"
						[[durable_objects.bindings]]
						name = "MY_DO"
						class_name = "DurableObjectClass"
					`,
			});
			await expect(
				runInNode(/* javascript */ `await (async () => {
						const durableObjectId = env.DO.idFromName("do");
						const doStub = env.DO.get(durableObjectId);
						const doResp = await doStub.fetch("http://0.0.0.0");
						return  await doResp.text();
					})()`)
			).resolves.toMatchInlineSnapshot(`
				"Hello from DurableObject
				"
			`);
		});

		describe("provides rpc service bindings to external local workers", () => {
			beforeEach(async () => {
				await seed(worker, {
					"src/index.ts": dedent/* javascript */ `
							import { RpcTarget, WorkerEntrypoint } from "cloudflare:workers";

							export default {
								async fetch(request: Request, env: Record<string, unknown>, ctx: unknown) {
									throw new Error(
										"Worker only used for RPC calls, there's no default fetch handler"
									);
								},
							};

							export class NamedEntrypoint extends WorkerEntrypoint {
								sum(args: number[]): number {
									return args.reduce((a, b) => a + b);
								}

								sumObj(args: number[]): { isObject: true; value: number } {
									return {
										isObject: true,
										value: args.reduce((a, b) => a + b),
									};
								}

								asJsonResponse(args: unknown): {
									status: number;
									text: () => Promise<string>;
								} {
									return Response.json(args);
								}
								getCounter() {
									return new Counter();
								}

								getHelloWorldFn() {
									return () => "Hello World!";
								}

								getHelloFn() {
									return (
										greet: string,
										name: string,
										{
											suffix,
											capitalize,
										}: {
											suffix?: string;
											capitalize?: boolean;
										} = {}
									) => {
										const result = greet + " " + name + (suffix ?? "");
										if (capitalize) {
											return result.toUpperCase();
										}
										return result;
									};
								}
							}

							class Counter extends RpcTarget {
								#value = 0;

								increment(amount: number) {
									this.#value += amount;
									return this.#value;
								}

								get value() {
									return this.#value;
								}
							}
					`,
				});
				await seed(app, {
					"wrangler.toml": dedent`
							name = "app"
							account_id = "${CLOUDFLARE_ACCOUNT_ID}"
							compatibility_date = "2023-01-01"
							compatibility_flags = ["nodejs_compat"]

							[[services]]
							binding = "WORKER"
							service = '${workerName}'
							entrypoint = "NamedEntrypoint"
					`,
				});
			});

			it("can call RPC methods returning a string", async () => {
				await expect(
					runInNode(/* javascript */ `await env.WORKER.sum([1, 2, 3])`)
				).resolves.toContain("6");
			});
			it("can call RPC methods returning an object", async () => {
				await expect(
					runInNode(
						/* javascript */ `JSON.stringify(await env.WORKER.sumObj([1, 2, 3, 5]))`
					)
				).resolves.toMatchInlineSnapshot(`
					"{"isObject":true,"value":11}
					"
				`);
			});
			it("can call RPC methods returning a Response", async () => {
				await expect(
					runInNode(/* javascript */ `await (async () => {
							const r = await env.WORKER.asJsonResponse([1, 2, 3]);
							return JSON.stringify({status: r.status, text: await r.text()})
						})()`)
				).resolves.toMatchInlineSnapshot(`
					"{"status":200,"text":"[1,2,3]"}
					"
				`);
			});
			it("can obtain and interact with RpcStubs", async () => {
				await expect(
					runInNode(/* javascript */ `await (async () => {
							const counter = await env.WORKER.getCounter();
							return JSON.stringify([
								await counter.value,
								await counter.increment(4),
								await counter.increment(8),
								await counter.value
							])
						})()`)
				).resolves.toMatchInlineSnapshot(`
					"[0,4,12,12]
					"
				`);
			});
			it("can obtain and interact with returned functions", async () => {
				await expect(
					runInNode(/* javascript */ `await (async () => {
							const helloWorldFn = await env.WORKER.getHelloWorldFn();
							const helloFn = await env.WORKER.getHelloFn();
							return JSON.stringify([
								helloWorldFn(),
								await helloFn("hi", "world"),
								await helloFn("hi", "world", {
									capitalize: true,
								}),
								await helloFn("Sup", "world", {
									capitalize: true,
									suffix: "?!",
								})
							])
						})()`)
				).resolves.toMatchInlineSnapshot(`
					"["Hello World!","hi world","HI WORLD","SUP WORLD?!"]
					"
				`);
			});
		});
	});

	describe("Hyperdrive", () => {
		let root: string;
		let port = 5432;
		let server: nodeNet.Server;

		beforeEach(async () => {
			server = nodeNet.createServer().listen();

			if (server.address() && typeof server.address() !== "string") {
				port = (server.address() as nodeNet.AddressInfo).port;
			}

			root = makeRoot();

			await seed(root, {
				"wrangler.toml": dedent`
						name = "hyperdrive-app"
						compatibility_date = "2024-08-20"
						compatibility_flags = ["nodejs_compat"]

						[[hyperdrive]]
						binding = "HYPERDRIVE"
						id = "hyperdrive_id"
						localConnectionString = "postgresql://user:%21pass@127.0.0.1:${port}/some_db"
				`,
				"index.mjs": dedent/*javascript*/ `
						import { getPlatformProxy } from "${WRANGLER_IMPORT}";

						const { env, dispose } = await getPlatformProxy();

						const conn = env.HYPERDRIVE.connect();
						await conn.writable.getWriter().write(new TextEncoder().encode("test string sent using getPlatformProxy"));

						await dispose();
						`,
				"package.json": dedent`
						{
							"name": "hyperdrive-app",
							"version": "0.0.0",
							"private": true
						}
						`,
			});
		});

		it.skipIf(
			// in CI this test fails for windows because of ECONNRESET issues
			process.platform === "win32"
		)(
			"can connect to a TCP socket via the hyperdrive connect method",
			async () => {
				const socketDataMsgPromise = new Promise<string>((resolve, _) => {
					server.on("connection", (sock) => {
						sock.on("data", (data) => {
							resolve(new TextDecoder().decode(data));
							server.close();
						});
					});
				});

				execSync("node index.mjs", {
					cwd: root,
					encoding: "utf-8",
				});
				expect(await socketDataMsgPromise).toMatchInlineSnapshot(
					`"test string sent using getPlatformProxy"`
				);
			}
		);
	});
});
