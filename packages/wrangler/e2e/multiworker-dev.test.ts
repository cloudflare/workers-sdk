import { randomUUID } from "node:crypto";
import dedent from "ts-dedent";
import { fetch } from "undici";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WranglerE2ETestHelper } from "./helpers/e2e-wrangler-test";
import { fetchText } from "./helpers/fetch-text";
import { generateResourceName } from "./helpers/generate-resource-name";
import { seed as baseSeed, makeRoot } from "./helpers/setup";
import type { RequestInit } from "undici";

async function fetchJson<T>(url: string, info?: RequestInit): Promise<T> {
	return vi.waitFor(
		async () => {
			const text: string = await fetch(url, {
				headers: { "MF-Disable-Pretty-Error": "true" },
				...info,
			}).then((r) => r.text());
			try {
				return JSON.parse(text) as T;
			} catch (cause) {
				const err = new Error(`Failed to parse JSON from:\n${text}`);
				err.cause = cause;
				throw err;
			}
		},
		{ timeout: 10_000, interval: 250 }
	);
}

describe("multiworker", () => {
	let workerName: string;
	let workerName2: string;
	let workerName3: string;
	let a: string;
	let b: string;
	let c: string;
	let helper: WranglerE2ETestHelper;
	beforeEach(async () => {
		workerName = generateResourceName("worker");
		workerName2 = generateResourceName("worker");
		workerName3 = generateResourceName("worker");
		helper = new WranglerE2ETestHelper();
		a = await makeRoot();
		await baseSeed(a, {
			"wrangler.toml": dedent`
					name = "${workerName}"
					main = "src/index.ts"
					compatibility_date = "2024-11-01"
			`,
			"src/index.ts": dedent/* javascript */ `
				import { DurableObject } from "cloudflare:workers";

				export default {
					async fetch(req, env) {
                        const url = new URL(req.url)
                        if (url.pathname === "/do") {
                            const id = env.MY_DO.idFromName(url.pathname);
                            const stub = env.MY_DO.get(id);
                            return stub.fetch(req);
                        }
                        if (url.pathname === "/service") {
                            return env.CEE.fetch(req);
                        }
						if (url.pathname === "/count") {
                            const counter = await env.COUNTER.newCounter()
							await counter.increment(1)
							await counter.increment(2)
							await counter.increment(3)
							return new Response(String(await counter.value))
                        }
                        if (url.pathname === "/props") {
                            const props = await env.COUNTER.getProps()
                            return new Response(JSON.stringify(props))
                        }
						return env.BEE.fetch(req);
					},
				};

                export class MyDurableObject extends DurableObject {
                    async fetch(request: Request) {
                        if (request.headers.has("X-Reset-Count")) {
                            await this.ctx.storage.put("count", 0);
                        }
                        let count: number = (await this.ctx.storage.get("count")) || 0;
                        await this.ctx.storage.put("count", ++count);
                        return Response.json({ count });
                    }

					sayHello(name: string) {
						return "Hello " + name
					}
                }
				`,
			"package.json": dedent`
					{
						"name": "a",
						"version": "0.0.0",
						"private": true
					}
					`,
		});

		b = await makeRoot();
		await baseSeed(b, {
			"wrangler.toml": dedent`
					name = "${workerName2}"
					main = "src/index.ts"
					compatibility_date = "2024-11-01"


                    [durable_objects]
                    bindings = [
                        { name = "REFERENCED_DO", class_name = "MyDurableObject", script_name = "${workerName}" }
                    ]
			`,
			"src/index.ts": dedent/* javascript */ `
				import { WorkerEntrypoint, RpcTarget } from "cloudflare:workers";

				class Counter extends RpcTarget {
					#value = 0;

					increment(amount) {
						this.#value += amount;
						return this.#value;
					}

					get value() {
						return this.#value;
					}
				}

				export class CounterService extends WorkerEntrypoint {
					async newCounter() {
						return new Counter();
					}
					async getProps() {
						return this.ctx.props;
					}
				}
				export default{
					async fetch(req, env) {
                        const url = new URL(req.url)
                        if (url.pathname === "/do") {
                            const id = env.REFERENCED_DO.idFromName(url.pathname);
                            const stub = env.REFERENCED_DO.get(id);
                            return stub.fetch(req);
                        }
						if (url.pathname === "/do-rpc") {
                            const id = env.REFERENCED_DO.idFromName(url.pathname);
                            const stub = env.REFERENCED_DO.get(id);
                            return new Response(await stub.sayHello("through DO RPC"));
                        }
						return new Response("hello world");
					},
				};
			`,
			"package.json": dedent`
					{
						"name": "b",
						"version": "0.0.0",
						"private": true
					}
					`,
		});

		c = await makeRoot();
		await baseSeed(c, {
			"wrangler.toml": dedent`
					name = "${workerName3}"
					main = "src/index.ts"
			`,
			"src/index.ts": dedent/* javascript */ `
                addEventListener("fetch", (event) => {
                    event.respondWith(new Response("Hello from service worker"));
                });
			`,
			"package.json": dedent`
					{
						"name": "c",
						"version": "0.0.0",
						"private": true
					}
					`,
		});
	});

	describe("module workers", () => {
		beforeEach(async () => {
			await baseSeed(a, {
				"wrangler.toml": dedent`
						name = "${workerName}"
						main = "src/index.ts"
						compatibility_date = "2024-11-01"

						[[services]]
						binding = "BEE"
						service = '${workerName2}'

						[[services]]
						binding = "COUNTER"
						service = '${workerName2}'
						entrypoint = 'CounterService'
						props = { foo = 123, bar = { baz = "hello from props" } }
				`,
			});
		});
		it("can fetch b", async () => {
			const worker = helper.runLongLived(`wrangler dev`, { cwd: b });

			const { url } = await worker.waitForReady(5_000);

			await expect(fetch(url).then((r) => r.text())).resolves.toBe(
				"hello world"
			);
		});

		it("can fetch b through a", async () => {
			const workerA = helper.runLongLived(
				`wrangler dev -c wrangler.toml -c ${b}/wrangler.toml`,
				{ cwd: a }
			);
			const { url } = await workerA.waitForReady(5_000);

			await vi.waitFor(
				async () => await expect(fetchText(url)).resolves.toBe("hello world"),
				{ interval: 1000, timeout: 10_000 }
			);
		});

		it("can fetch named entrypoint on b through a and do RPC", async () => {
			const workerA = helper.runLongLived(
				`wrangler dev -c wrangler.toml -c ${b}/wrangler.toml`,
				{ cwd: a }
			);
			const { url } = await workerA.waitForReady(5_000);

			await vi.waitFor(
				async () => await expect(fetchText(`${url}/count`)).resolves.toBe("6"),
				{ interval: 1000, timeout: 10_000 }
			);
		});

		it("can access service props through a binding", async () => {
			const workerA = helper.runLongLived(
				`wrangler dev -c wrangler.toml -c ${b}/wrangler.toml`,
				{ cwd: a }
			);
			const { url } = await workerA.waitForReady(5_000);

			await vi.waitFor(
				async () => {
					const response = await fetch(`${url}/props`);
					const props = await response.json();
					expect(props).toEqual({
						foo: 123,
						bar: { baz: "hello from props" },
					});
				},
				{ interval: 1000, timeout: 10_000 }
			);
		});

		it("shows runtime error when fetching non-existent service", async () => {
			const service = randomUUID();
			await baseSeed(a, {
				"wrangler.toml": dedent`
						name = "${workerName}"
						main = "src/index.ts"
						compatibility_date = "2024-11-01"

						[[services]]
						binding = "BEE"
						service = '${service}'
				`,
			});

			const workerA = helper.runLongLived(
				`wrangler dev -c wrangler.toml -c ${b}/wrangler.toml`,
				{ cwd: a }
			);

			const { url } = await workerA.waitForReady(5_000);

			await vi.waitFor(
				async () =>
					await expect(fetchText(url)).resolves.toBe(
						`Couldn't find a local dev session for the "default" entrypoint of service "${service}" to proxy to`
					),
				{ interval: 1000, timeout: 10_000 }
			);
		});
	});

	describe("service workers", () => {
		beforeEach(async () => {
			await baseSeed(a, {
				"wrangler.toml": dedent`
					name = "${workerName}"
					main = "src/index.ts"
					compatibility_date = "2024-11-01"

                    [[services]]
					binding = "CEE"
					service = '${workerName3}'
			`,
			});
		});

		it("can fetch service worker c through a", async () => {
			const workerA = helper.runLongLived(
				`wrangler dev -c wrangler.toml -c ${c}/wrangler.toml`,
				{ cwd: a }
			);
			const { url } = await workerA.waitForReady(5_000);

			await vi.waitFor(
				async () =>
					await expect(fetchText(`${url}/service`)).resolves.toBe(
						"Hello from service worker"
					),
				{ interval: 1000, timeout: 10_000 }
			);
		});
	});

	describe("durable objects", () => {
		beforeEach(async () => {
			await baseSeed(a, {
				"wrangler.toml": dedent`
						name = "${workerName}"
						main = "src/index.ts"
						compatibility_date = "2024-11-01"

						[[services]]
						binding = "BEE"
						service = '${workerName2}'

						[durable_objects]
						bindings = [
							{ name = "MY_DO", class_name = "MyDurableObject" }
						]

						[[migrations]]
						tag = "v1"
						new_classes = ["MyDurableObject"]
				`,
			});
		});
		it("can fetch DO through a", async () => {
			const worker = helper.runLongLived(`wrangler dev`, { cwd: a });

			const { url } = await worker.waitForReady(5_000);

			await expect(
				fetchJson(`${url}/do`, {
					headers: {
						"X-Reset-Count": "true",
					},
				})
			).resolves.toMatchObject({ count: 1 });
		});

		it("can fetch remote DO attached to a through b", async () => {
			const workerB = helper.runLongLived(
				`wrangler dev -c wrangler.toml -c ${a}/wrangler.toml`,
				{ cwd: b }
			);
			const { url } = await workerB.waitForReady(5_000);

			await vi.waitFor(
				async () =>
					await expect(
						fetchJson(`${url}/do`, {
							headers: {
								"X-Reset-Count": "true",
							},
						})
					).resolves.toMatchObject({ count: 1 }),
				{ interval: 1000, timeout: 10_000 }
			);
		});

		it("can fetch remote DO attached to a through b with RPC", async () => {
			const workerB = helper.runLongLived(
				`wrangler dev -c wrangler.toml -c ${a}/wrangler.toml`,
				{ cwd: b }
			);
			const { url } = await workerB.waitForReady(5_000);

			await vi.waitFor(
				async () =>
					await expect(fetchText(`${url}/do-rpc`)).resolves.toBe(
						"Hello through DO RPC"
					),
				{ interval: 1000, timeout: 10_000 }
			);
		});
	});

	describe("Tail consumers", () => {
		beforeEach(async () => {
			await baseSeed(a, {
				"wrangler.toml": dedent`
						name = "${workerName}"
						main = "src/index.ts"
						compatibility_date = "2025-04-28"

						[[tail_consumers]]
						service = "${workerName2}"
				`,
				"src/index.ts": dedent/* javascript */ `
					export default {
						async fetch(req, env) {
							console.log("log something")
							return new Response("hello from a")
						},
					};
					`,
			});

			b = await makeRoot();
			await baseSeed(b, {
				"wrangler.toml": dedent`
						name = "${workerName2}"
						main = "src/index.ts"
						compatibility_date = "2025-04-28"
				`,
				"src/index.ts": dedent/* javascript */ `
					export default {
						async tail(event) {
							console.log("received tail event", event)
						},
					};
				`,
			});
		});

		it("can fetch a without b running", async () => {
			const worker = helper.runLongLived(`wrangler dev`, { cwd: a });

			const { url } = await worker.waitForReady(5_000);

			await expect(fetchText(`${url}`)).resolves.toBe("hello from a");
		});

		it("tail event sent to b", async () => {
			const worker = helper.runLongLived(
				`wrangler dev -c wrangler.toml -c ${b}/wrangler.toml`,
				{ cwd: a }
			);
			const { url } = await worker.waitForReady(5_000);

			await expect(fetchText(`${url}`)).resolves.toBe("hello from a");

			await vi.waitFor(
				async () =>
					expect(worker.currentOutput).includes("received tail event"),
				{ interval: 1000, timeout: 10_000 }
			);
		});
	});

	describe("pages", () => {
		beforeEach(async () => {
			await baseSeed(a, {
				"wrangler.toml": dedent`
					name = "${workerName}"
					pages_build_output_dir = "./public"
					compatibility_date = "2024-11-01"

                    [[services]]
					binding = "CEE"
					service = '${workerName3}'

					[[services]]
					binding = "BEE"
					service = '${workerName2}'
				`,
				"functions/cee.ts": dedent/* javascript */ `
				export async function onRequest(context) {
					return context.env.CEE.fetch("https://example.com");
				}`,
				"functions/bee.ts": dedent/* javascript */ `
				export async function onRequest(context) {
					return context.env.BEE.fetch("https://example.com");
				}`,
				"public/index.html": `<h1>hello pages assets</h1>`,
			});
		});

		it("pages project assets", async () => {
			const pages = helper.runLongLived(
				`wrangler pages dev -c wrangler.toml -c ${b}/wrangler.toml -c ${c}/wrangler.toml`,
				{ cwd: a }
			);
			const { url } = await pages.waitForReady(5_000);

			await vi.waitFor(
				async () =>
					await expect(fetchText(`${url}`)).resolves.toBe(
						"<h1>hello pages assets</h1>"
					),
				{ interval: 1000, timeout: 10_000 }
			);
		});

		it("pages project fetching service worker", async () => {
			const pages = helper.runLongLived(
				`wrangler pages dev -c wrangler.toml -c ${b}/wrangler.toml -c ${c}/wrangler.toml`,
				{ cwd: a }
			);
			const { url } = await pages.waitForReady(5_000);

			await vi.waitFor(
				async () =>
					await expect(fetchText(`${url}/cee`)).resolves.toBe(
						"Hello from service worker"
					),
				{ interval: 1000, timeout: 10_000 }
			);
		});

		it("pages project fetching module worker", async () => {
			const pages = helper.runLongLived(
				`wrangler pages dev -c wrangler.toml -c ${b}/wrangler.toml -c ${c}/wrangler.toml`,
				{ cwd: a }
			);
			const { url } = await pages.waitForReady(5_000);

			await vi.waitFor(
				async () =>
					await expect(fetchText(`${url}/bee`)).resolves.toBe("hello world"),
				{ interval: 1000, timeout: 10_000 }
			);
		});

		it("should error if multiple pages configs are provided", async () => {
			const pages = helper.runLongLived(
				`wrangler pages dev -c wrangler.toml -c wrangler.toml`,
				{ cwd: a }
			);
			await pages.readUntil(
				/You cannot use a Pages project as a service binding target/
			);
		});
	});
});
