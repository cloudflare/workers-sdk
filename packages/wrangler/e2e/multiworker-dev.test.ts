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

		it("shows error on startup with non-existent service", async () => {
			await baseSeed(a, {
				"wrangler.toml": dedent`
						name = "${workerName}"
						main = "src/index.ts"
						compatibility_date = "2024-11-01"

						[[services]]
						binding = "BEE"
						service = '${randomUUID()}'
				`,
			});

			const workerA = helper.runLongLived(
				`wrangler dev -c wrangler.toml -c ${b}/wrangler.toml`,
				{ cwd: a }
			);
			await workerA.readUntil(/no such service is defined/);

			expect(await workerA.exitCode).toBe(1);
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

	describe("workers with assets", async () => {
		let workerNameAW: string;
		let workerName4: string;
		let aw: string;
		let d: string;

		const devCmds = [{ args: [] }, { args: ["--x-assets-rpc"] }];

		describe.each(devCmds)(
			"[wrangler dev $args]-> worker with assets -> regular worker",
			({ args }) => {
				beforeEach(async () => {
					aw = await makeRoot();
					workerNameAW = generateResourceName("worker-aw");
					workerName4 = generateResourceName("worker");
					await baseSeed(aw, {
						"wrangler.toml": dedent`
							name = "${workerNameAW}"
							main = "src/index.ts"
							compatibility_date = "2024-11-01"

							[assets]
							directory = "./public/"
							binding = "ASSETS"

							[[services]]
							binding = "DEE"
							service = '${workerName4}'

							[[services]]
							binding = "COUNTER"
							service = '${workerName4}'
							entrypoint = 'CounterService'

							[durable_objects]
							bindings = [
								{ name = "REFERENCED_DO", class_name = "MyDurableObject", script_name = "${workerName4}" }
							]
						`,
						"public/asset-binding.html": "<p>have an asset via a binding</p>",
						"public/asset.html": "<p>have an asset directly</p>",
						"src/index.ts": dedent/* javascript */ `
							export default {
								async fetch(req, env) {
									const url = new URL(req.url)
									if (url.pathname === "/asset-via-binding") {
										return env.ASSETS.fetch(new URL("asset-binding.html", req.url));
									}
									if (url.pathname === "/worker") {
										return new Response("hello world from a worker with assets");
									}
									if (url.pathname === "/count") {
										const counter = await env.COUNTER.newCounter()
										await counter.increment(1)
										await counter.increment(2)
										await counter.increment(3)
										return new Response(String(await counter.value))
									}
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
									return env.DEE.fetch(req);
								},
							};
							`,
						"package.json": dedent`
								{
									"name": "aw",
									"version": "0.0.0",
									"private": true
								}
								`,
					});

					d = await makeRoot();
					await baseSeed(d, {
						"wrangler.toml": dedent`
						name = "${workerName4}"
						main = "src/index.ts"
						compatibility_date = "2024-11-01"
				`,
						"src/index.ts": dedent/* javascript */ `
						import { DurableObject, WorkerEntrypoint, RpcTarget } from "cloudflare:workers";
						export default{
							async fetch(req, env) {
								return new Response("hello world from dee");
							}
						};
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
						}

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
								return "Hello " + name;
							}
						}
						`,
					});
				});

				it("can fetch a worker with assets", async () => {
					const worker = helper.runLongLived(
						`wrangler dev -c wrangler.toml -c ${d}/wrangler.toml ${args.join(" ")}`,
						{ cwd: aw }
					);

					const { url } = await worker.waitForReady(5_000);
					await expect(fetchText(`${url}/asset`)).resolves.toBe(
						"<p>have an asset directly</p>"
					);
					await expect(fetchText(`${url}/asset-via-binding`)).resolves.toBe(
						"<p>have an asset via a binding</p>"
					);
					await expect(
						fetch(`${url}/worker`).then((r) => r.text())
					).resolves.toBe("hello world from a worker with assets");
				});

				it("can fetch a regular worker through a worker with assets, including with rpc", async () => {
					const worker = helper.runLongLived(
						`wrangler dev -c wrangler.toml -c ${d}/wrangler.toml ${args.join(" ")}`,
						{ cwd: aw }
					);

					const { url } = await worker.waitForReady(5_000);

					await expect(
						fetch(`${url}/hello-from-dee`).then((r) => r.text())
					).resolves.toBe("hello world from dee");

					await vi.waitFor(
						async () =>
							await expect(fetchText(`${url}/count`)).resolves.toBe("6"),
						{ interval: 1000, timeout: 10_000 }
					);
				});

				it("can fetch a DO through a worker with assets, including with rpc", async () => {
					const worker = helper.runLongLived(
						`wrangler dev -c wrangler.toml -c ${d}/wrangler.toml ${args.join(" ")}`,
						{ cwd: aw }
					);

					const { url } = await worker.waitForReady(5_000);

					await vi.waitFor(
						async () =>
							await expect(fetchText(`${url}/do-rpc`)).resolves.toBe(
								"Hello through DO RPC"
							),
						{ interval: 1000, timeout: 10_000 }
					);
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
			}
		);

		describe.each(devCmds)(
			"[wrangler dev $args]-> regular worker -> worker with assets",
			({ args }) => {
				beforeEach(async () => {
					await baseSeed(aw, {
						"wrangler.toml": dedent`
								name = "${workerNameAW}"
								main = "src/index.ts"
								compatibility_date = "2024-11-01"
								[assets]
								directory = "./public/"
								binding = "ASSETS"
						`,
						"src/index.ts": dedent/* javascript */ `
							export default {
								async fetch(req, env) {
									const url = new URL(req.url)
									if (url.pathname === "/asset-via-binding") {
										return env.ASSETS.fetch(new URL("asset-binding.html", req.url));
									}
									return new Response("hello world from a worker with assets")
								},
								add(a, b) { return a + b; }
							};
							`,
					});
					await baseSeed(d, {
						"wrangler.toml": dedent`
						name = "${workerName4}"
						main = "src/index.ts"
						compatibility_date = "2024-11-01"
						[[services]]
						binding = "AW"
						service = '${workerNameAW}'
				`,
						"src/index.ts": dedent/* javascript */ `
						export default{
							async fetch(req, env) {
								const url = new URL(req.url)
								if (url.pathname === "/rpc") {
									return env.AW.add(1,2);
								}
								return env.AW.fetch(req);
							}
						};`,
					});
				});

				it("can fetch assets through a regular worker", async () => {
					const worker = helper.runLongLived(
						`wrangler dev -c wrangler.toml -c ${aw}/wrangler.toml ${args.join(" ")}`,
						{ cwd: d }
					);

					const { url } = await worker.waitForReady(5_000);
					await expect(fetchText(`${url}/asset`)).resolves.toBe(
						"<p>have an asset directly</p>"
					);
				});

				it("can fall back to user worker", async () => {
					const worker = helper.runLongLived(
						`wrangler dev -c wrangler.toml -c ${aw}/wrangler.toml ${args.join(" ")}`,
						{ cwd: d }
					);

					const { url } = await worker.waitForReady(5_000);
					await expect(fetchText(`${url}/worker`)).resolves.toBe(
						"hello world from a worker with assets"
					);
					await expect(fetchText(`${url}/asset-via-binding`)).resolves.toBe(
						"<p>have an asset via a binding</p>"
					);
				});

				it.fails("call rpc on a worker with assets", async () => {
					// because it hits the router worker not the user worker, and add is not implemented there
					// proxy/filter worker will fix this
					const worker = helper.runLongLived(
						`wrangler dev -c wrangler.toml -c ${aw}/wrangler.toml ${args.join(" ")}`,
						{ cwd: d }
					);

					const { url } = await worker.waitForReady(5_000);
					await expect(fetchText(`${url}/rpc`)).resolves.toEqual(3);
				});
				// wrangler dev just crashses because the named entrypoint does not exist on the router worker
				it.fails(
					"binding to named entrypoint on a worker with assets",
					async () => {
						await baseSeed(aw, {
							"wrangler.toml": dedent`
								name = "${workerNameAW}"
								main = "src/index.ts"
								compatibility_date = "2024-11-01"
								[assets]
								directory = "./public/"
								binding = "ASSETS"
						`,
							"src/index.ts": dedent/* javascript */ `
							import { WorkerEntrypoint } from "cloudflare:workers";
							export class NamedEntrypoint extends WorkerEntrypoint {
								async add(a, b) {
									return a + b;
								}
								async fetch(req) {
									return new Response("hello world from the fetch handler of a named entrypoint")
								}
							}
							export default {
								async fetch(req, env) {
									return new Response("hello world from a worker with assets")
								},
							};
							`,
						});
						await baseSeed(d, {
							"wrangler.toml": dedent`
						name = "${workerName4}"
						main = "src/index.ts"
						compatibility_date = "2024-11-01"
						[[services]]
						binding = "NAMED"
						service = '${workerNameAW}'
						entrypoint = "NamedEntrypoint"
				`,
							"src/index.ts": dedent/* javascript */ `
						export default{
							async fetch(req, env) {
								const url = new URL(req.url)
								if (url.pathname === "/named-rpc") {
									return env.NAMED.add(1,2);
								}
								if (url.pathname === "/named-fetch") {
									return env.NAMED.fetch(req);
								}
								return new Response("hello world");
							}
						};`,
						});

						const worker = helper.runLongLived(
							`wrangler dev -c wrangler.toml -c ${aw}/wrangler.toml ${args.join(" ")}`,
							{ cwd: d }
						);

						const { url } = await worker.waitForReady(5_000);
						await expect(fetchText(`${url}/named-rpc`)).resolves.toEqual(3);
					}
				);
			}
		);
	});
});
