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
		{ timeout: 5_000, interval: 250 }
	);
}

async function startWorkersDevRegistry(
	wranglerDev: string,
	helper: WranglerE2ETestHelper,
	assetWorker: string,
	regularWorker: string,
	regularWorkerFirst = true
) {
	const workerA = helper.runLongLived(wranglerDev, {
		cwd: regularWorkerFirst ? assetWorker : regularWorker,
	});
	await workerA.waitForReady(5_000);

	const workerB = helper.runLongLived(wranglerDev, {
		cwd: regularWorkerFirst ? regularWorker : assetWorker,
	});
	const { url } = await workerB.waitForReady(5_000);

	return url;
}

async function startWorkersMultiworker(
	wranglerDev: string,
	helper: WranglerE2ETestHelper,
	assetWorker: string,
	regularWorker: string,
	regularWorkerFirst = true
) {
	const worker = helper.runLongLived(
		`${wranglerDev} -c wrangler.toml -c ${regularWorkerFirst ? assetWorker : regularWorker}/wrangler.toml`,
		{ cwd: regularWorkerFirst ? regularWorker : assetWorker }
	);
	const { url } = await worker.waitForReady(5_000);
	return url;
}

type MultiworkerStyle = "dev registry" | "in process";

describe.each(
	(process.platform === "win32"
		? [
				{
					style: "in process",
					start: startWorkersMultiworker,
					wranglerDev: "wrangler dev",
				},
			]
		: [
				{
					style: "dev registry",
					start: startWorkersDevRegistry,
					wranglerDev: "wrangler dev",
				},
				{
					style: "in process",
					start: startWorkersMultiworker,
					wranglerDev: "wrangler dev",
				},
			]) as {
		style: MultiworkerStyle;
		start: typeof startWorkersDevRegistry | typeof startWorkersMultiworker;
		wranglerDev: string;
	}[]
)(
	"workers with assets ($style, $wranglerDev) ",
	async ({ start, style, wranglerDev }) => {
		let assetWorkerName: string;
		let regularWorkerName: string;
		let assetWorker: string;
		let regularWorker: string;
		let helper: WranglerE2ETestHelper;

		beforeEach(async () => {
			helper = new WranglerE2ETestHelper();

			assetWorker = await makeRoot();
			assetWorkerName = generateResourceName("worker-aw");
			regularWorkerName = generateResourceName("worker");
			await baseSeed(assetWorker, {
				"wrangler.toml": dedent`
						name = "${assetWorkerName}"
						main = "src/index.ts"
						compatibility_date = "2024-11-01"
compatibility_flags = ["fetch_iterable_type_support", "fetch_iterable_type_support_override_adjustment", "enable_nodejs_process_v2"]

						[assets]
						directory = "public"
						binding = "ASSETS"

						[[services]]
						binding = "DEFAULT"
						service = '${regularWorkerName}'

						[[services]]
						binding = "COUNTER"
						service = '${regularWorkerName}'
						entrypoint = 'CounterService'

						[durable_objects]
						bindings = [
							{ name = "REFERENCED_DO", class_name = "MyDurableObject", script_name = "${regularWorkerName}" }
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
								return env.DEFAULT.fetch(req);
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

			regularWorker = await makeRoot();
			await baseSeed(regularWorker, {
				"wrangler.toml": dedent`
					name = "${regularWorkerName}"
					main = "src/index.ts"
					compatibility_date = "2024-11-01"
compatibility_flags = ["fetch_iterable_type_support", "fetch_iterable_type_support_override_adjustment", "enable_nodejs_process_v2"]
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
		describe("worker with assets -> regular worker", () => {
			it("can fetch a worker with assets", async () => {
				const url = await start(
					wranglerDev,
					helper,
					assetWorker,
					regularWorker,
					false
				);

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
				const url = await start(
					wranglerDev,
					helper,
					assetWorker,
					regularWorker,
					false
				);

				await vi.waitFor(
					async () =>
						await expect(
							fetch(`${url}/hello-from-dee`).then((r) => r.text())
						).resolves.toBe("hello world from dee"),
					{ interval: 1000, timeout: 5_000 }
				);

				await vi.waitFor(
					async () =>
						await expect(fetchText(`${url}/count`)).resolves.toBe("6"),
					{ interval: 1000, timeout: 10_000 }
				);
			});

			it.skipIf(style === "dev registry")(
				"can fetch a DO through a worker with assets, including with rpc",
				async () => {
					const url = await start(
						wranglerDev,
						helper,
						assetWorker,
						regularWorker,
						false
					);

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
				}
			);
		});

		describe("regular worker -> assets-only", () => {
			beforeEach(async () => {
				await baseSeed(regularWorker, {
					"wrangler.toml": dedent`
						name = "${regularWorkerName}"
						main = "src/index.ts"
						compatibility_date = "2024-11-01"
compatibility_flags = ["fetch_iterable_type_support", "fetch_iterable_type_support_override_adjustment", "enable_nodejs_process_v2"]
						[[services]]
						binding = "AW"
						service = '${assetWorkerName}'
				`,
					"src/index.ts": dedent/* javascript */ `
						export default {
							async fetch(req, env) {
								const url = new URL(req.url)
								if (url.pathname === "/rpc") {
									return env.AW.increment(1);
								}
								return env.AW.fetch(req);
							}
						};`,
				});
				await baseSeed(assetWorker, {
					"wrangler.toml": dedent`
								name = "${assetWorkerName}"
								compatibility_date = "2024-11-01"
compatibility_flags = ["fetch_iterable_type_support", "fetch_iterable_type_support_override_adjustment", "enable_nodejs_process_v2"]

								[assets]
								directory = "public"
						`,
				});
			});

			it(".fetch() existing asset", async () => {
				const url = await start(
					wranglerDev,
					helper,
					assetWorker,
					regularWorker
				);
				await vi.waitFor(
					async () =>
						await expect(fetchText(`${url}/asset`)).resolves.toBe(
							"<p>have an asset directly</p>"
						),
					{ interval: 1000, timeout: 5_000 }
				);
			});

			it(".fetch() non-existing asset", async () => {
				const url = await start(
					wranglerDev,
					helper,
					assetWorker,
					regularWorker
				);
				await vi.waitFor(
					async () =>
						await expect(fetch(`${url}/not-an-asset`)).resolves.toMatchObject({
							status: 404,
						}),
					{ interval: 1000, timeout: 5_000 }
				);
			});

			it(".increment()", async () => {
				const url = await start(
					wranglerDev,
					helper,
					assetWorker,
					regularWorker
				);
				await vi.waitFor(
					async () =>
						await expect(fetchText(`${url}/rpc`)).resolves.toContain(
							// Cannot call RPC methods on assets-only workers
							"The RPC receiver does not implement the method"
						),
					{ interval: 1000, timeout: 5_000 }
				);
			});
		});

		describe("regular worker -> worker + assets", () => {
			beforeEach(async () => {
				await baseSeed(regularWorker, {
					"wrangler.toml": dedent`
							name = "${regularWorkerName}"
							main = "src/index.ts"
							compatibility_date = "2024-11-01"
compatibility_flags = ["fetch_iterable_type_support", "fetch_iterable_type_support_override_adjustment", "enable_nodejs_process_v2"]

							[[services]]
							binding = "AW"
							service = '${assetWorkerName}'
					`,
					"src/index.ts": dedent/* javascript */ `
							export default {
								async fetch(req, env) {
									const url = new URL(req.url)
									if (url.pathname === "/rpc") {
										return new Response(await env.AW.increment(1));
									}
									return env.AW.fetch(req);
								}
							};`,
				});
				await baseSeed(assetWorker, {
					"wrangler.toml": dedent`
								name = "${assetWorkerName}"
								compatibility_date = "2024-11-01"
compatibility_flags = ["fetch_iterable_type_support", "fetch_iterable_type_support_override_adjustment", "enable_nodejs_process_v2"]
								main = "src/index.ts"

								[assets]
								directory = "public"
								binding = "ASSETS"
						`,
					"src/index.ts": dedent/* javascript */ `
							import { WorkerEntrypoint } from "cloudflare:workers"

							export default {
								async fetch(req, env) {
									const url = new URL(req.url)
									if (url.pathname === "/asset-via-binding") {
										return env.ASSETS.fetch(new URL("asset-binding.html", req.url));
									}
									return new Response("hello world from a worker with assets")
								},
								increment(a) { return a + 1; }
							};

							export class NamedEntrypoint extends WorkerEntrypoint {
								async fetch(req, env) {
									const url = new URL(req.url)
									if (url.pathname === "/asset-via-binding") {
										return env.ASSETS.fetch(new URL("asset-binding.html", req.url));
									}
									return new Response("hello world from a worker with assets")
								}
								increment(a) { return a + 1; }
							};
							`,
				});
			});

			describe("default export object", () => {
				beforeEach(async () => {
					await baseSeed(assetWorker, {
						"src/index.ts": dedent/* javascript */ `
									import { WorkerEntrypoint } from "cloudflare:workers"

									export default {
										async fetch(req, env) {
											const url = new URL(req.url)
											if (url.pathname === "/asset-via-binding") {
												return env.ASSETS.fetch(new URL("asset-binding.html", req.url));
											}
											return new Response("hello world from a worker with assets")
										},
										increment(a) { return a + 1; }
									};
									`,
					});
				});
				it(".fetch() existing asset", async () => {
					const url = await start(
						wranglerDev,
						helper,
						assetWorker,
						regularWorker
					);
					await vi.waitFor(
						async () =>
							await expect(fetchText(`${url}/asset`)).resolves.toBe(
								"<p>have an asset directly</p>"
							),
						{ interval: 1000, timeout: 5_000 }
					);
				});

				it(".fetch() non-existing asset", async () => {
					const url = await start(
						wranglerDev,
						helper,
						assetWorker,
						regularWorker
					);
					await vi.waitFor(
						async () =>
							await expect(fetchText(`${url}/not-an-asset`)).resolves.toBe(
								"hello world from a worker with assets"
							),
						{ interval: 1000, timeout: 5_000 }
					);
				});

				it(".fetch() asset via binding", async () => {
					const url = await start(
						wranglerDev,
						helper,
						assetWorker,
						regularWorker
					);
					await vi.waitFor(
						async () =>
							await expect(fetchText(`${url}/asset-via-binding`)).resolves.toBe(
								"<p>have an asset via a binding</p>"
							),
						{ interval: 1000, timeout: 5_000 }
					);
				});

				it(".increment()", async () => {
					const url = await start(
						wranglerDev,
						helper,
						assetWorker,
						regularWorker
					);
					await vi.waitFor(
						async () =>
							await expect(fetchText(`${url}/rpc`)).resolves.toBe("2"),
						{ interval: 1000, timeout: 5_000 }
					);
				});
			});

			describe("default export WorkerEntrypoint class", () => {
				beforeEach(async () => {
					await baseSeed(assetWorker, {
						"src/index.ts": dedent/* javascript */ `
									import { WorkerEntrypoint } from "cloudflare:workers"

									export default class Worker extends WorkerEntrypoint {
										async fetch(req) {
											const url = new URL(req.url)
											if (url.pathname === "/asset-via-binding") {
												return this.env.ASSETS.fetch(new URL("asset-binding.html", req.url));
											}
											return new Response("hello world from a worker with assets")
										}
										increment(a) { return a + 1; }
									};
									`,
					});
				});
				it(".fetch() existing asset", async () => {
					const url = await start(
						wranglerDev,
						helper,
						assetWorker,
						regularWorker
					);
					await vi.waitFor(
						async () =>
							await expect(fetchText(`${url}/asset`)).resolves.toBe(
								"<p>have an asset directly</p>"
							),
						{ interval: 1000, timeout: 5_000 }
					);
				});

				it(".fetch() non-existing asset", async () => {
					const url = await start(
						wranglerDev,
						helper,
						assetWorker,
						regularWorker
					);
					await vi.waitFor(
						async () =>
							await expect(fetchText(`${url}/not-an-asset`)).resolves.toBe(
								"hello world from a worker with assets"
							),
						{ interval: 1000, timeout: 5_000 }
					);
				});

				it(".fetch() asset via binding", async () => {
					const url = await start(
						wranglerDev,
						helper,
						assetWorker,
						regularWorker
					);
					await vi.waitFor(
						async () =>
							await expect(fetchText(`${url}/asset-via-binding`)).resolves.toBe(
								"<p>have an asset via a binding</p>"
							),
						{ interval: 1000, timeout: 5_000 }
					);
				});

				it(".increment()", async () => {
					const url = await start(
						wranglerDev,
						helper,
						assetWorker,
						regularWorker
					);
					await vi.waitFor(
						async () =>
							await expect(fetchText(`${url}/rpc`)).resolves.toBe("2"),
						{ interval: 1000, timeout: 5_000 }
					);
				});
			});

			describe("named export WorkerEntrypoint class", () => {
				beforeEach(async () => {
					await baseSeed(assetWorker, {
						"src/index.ts": dedent/* javascript */ `
									import { WorkerEntrypoint } from "cloudflare:workers"

									export default {fetch() {}}

									export class NamedEntrypoint extends WorkerEntrypoint {
										async fetch(req) {
											const url = new URL(req.url)
											if (url.pathname === "/asset-via-binding") {
												return this.env.ASSETS.fetch(new URL("asset-binding.html", req.url));
											}
											return new Response("hello world from a worker with assets")
										}
										async increment(a) { return a + 1; }
									};
									`,
					});
					await baseSeed(regularWorker, {
						"wrangler.toml": dedent`
									name = "${regularWorkerName}"
									main = "src/index.ts"
									compatibility_date = "2024-11-01"
compatibility_flags = ["fetch_iterable_type_support", "fetch_iterable_type_support_override_adjustment", "enable_nodejs_process_v2"]

									[[services]]
									binding = "AW"
									service = '${assetWorkerName}'
									entrypoint = "NamedEntrypoint"
							`,
					});
				});
				it(".fetch()", async () => {
					const url = await start(
						wranglerDev,
						helper,
						assetWorker,
						regularWorker
					);
					await vi.waitFor(
						async () =>
							await expect(fetchText(`${url}/asset`)).resolves.toBe(
								"hello world from a worker with assets"
							),
						{ interval: 1000, timeout: 5_000 }
					);
				});

				it(".fetch() asset via binding", async () => {
					const url = await start(
						wranglerDev,
						helper,
						assetWorker,
						regularWorker
					);
					await vi.waitFor(
						async () =>
							await expect(fetchText(`${url}/asset-via-binding`)).resolves.toBe(
								"<p>have an asset via a binding</p>"
							),
						{ interval: 1000, timeout: 5_000 }
					);
				});

				it(".increment()", async () => {
					const url = await start(
						wranglerDev,
						helper,
						assetWorker,
						regularWorker
					);
					await vi.waitFor(
						async () =>
							await expect(fetchText(`${url}/rpc`)).resolves.toBe("2"),
						{ interval: 1000, timeout: 5_000 }
					);
				});
			});
		});
	}
);
