import { mkdir, readFile, writeFile } from "fs/promises";
import * as fs from "node:fs";
import path from "path";
import dedent from "ts-dedent";
import { vi } from "vitest";
import { unstable_dev } from "../api";
import { mockConsoleMethods } from "./helpers/mock-console";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";

vi.unmock("child_process");
vi.unmock("undici");

/*
 * This file contains inline comments with the word "javascript"
 * This signals to a compatible editor extension that the template string
 * contents should be syntax-highlighted as JavaScript. One such extension
 * is zjcompt.es6-string-javascript, but there are others.
 */

async function seedFs(files: Record<string, string>): Promise<void> {
	for (const [location, contents] of Object.entries(files)) {
		await mkdir(path.dirname(location), { recursive: true });
		await writeFile(location, contents);
	}
}
describe("middleware", () => {
	mockConsoleMethods();

	describe("workers change behaviour with middleware with wrangler dev", () => {
		runInTempDir();

		beforeEach(() => {
			vi.stubEnv("EXPERIMENTAL_MIDDLEWARE", "true");
		});

		describe("module workers", () => {
			it("should register a middleware and intercept", async () => {
				const scriptContent = `
			const middleware = async (request, env, _ctx, middlewareCtx) => {
				const response = await middlewareCtx.next(request, env);
				const text = await response.text();
				return new Response(text + ' world');
			}

			export const __INJECT_FOR_TESTING_WRANGLER_MIDDLEWARE__ = [middleware]
			export default {
				fetch(request, env, ctx) {
					return new Response('Hello');
				}
			};
			`;
				fs.writeFileSync("index.js", scriptContent);

				const worker = await unstable_dev("index.js", {
					ip: "127.0.0.1",
					experimental: {
						disableExperimentalWarning: true,
						disableDevRegistry: true,
					},
				});

				const resp = await worker.fetch();
				let text;
				if (resp) {
					text = await resp.text();
				}
				expect(text).toMatchInlineSnapshot(`"Hello world"`);
				await worker.stop();
			});

			it("should be able to access scheduled workers from middleware", async () => {
				const scriptContent = `
			const middleware = async (request, env, _ctx, middlewareCtx) => {
				await middlewareCtx.dispatch("scheduled", { cron: "* * * * *" });
				return new Response("OK");
			}

			export const __INJECT_FOR_TESTING_WRANGLER_MIDDLEWARE__ = [middleware]
			export default {
				scheduled(controller, env, ctx) {
					// Scheduled worker called
				}
			}
			`;

				fs.writeFileSync("index.js", scriptContent);

				const worker = await unstable_dev("index.js", {
					ip: "127.0.0.1",
					experimental: {
						disableExperimentalWarning: true,
						disableDevRegistry: true,
					},
				});

				const resp = await worker.fetch();
				let text;
				if (resp) {
					text = await resp.text();
				}
				expect(text).toMatchInlineSnapshot(`"OK"`);
				await worker.stop();
			});

			it("should trigger an error in a scheduled work from middleware", async () => {
				const scriptContent = `
			const middleware = async (request, env, _ctx, middlewareCtx) => {
				try {
					await middlewareCtx.dispatch("scheduled", { cron: "* * * * *" });
				} catch (e) {
					return new Response(e.message);
				}
			}
			export const __INJECT_FOR_TESTING_WRANGLER_MIDDLEWARE__ = [middleware]

			export default {
				scheduled(controller, env, ctx) {
					throw new Error("Error in scheduled worker");
				}
			}
			`;

				fs.writeFileSync("index.js", scriptContent);

				const worker = await unstable_dev("index.js", {
					ip: "127.0.0.1",
					experimental: {
						disableExperimentalWarning: true,
						disableDevRegistry: true,
					},
				});

				const resp = await worker.fetch();
				let text;
				if (resp) {
					text = await resp.text();
				}
				expect(text).toMatchInlineSnapshot(`"Error in scheduled worker"`);
				await worker.stop();
			});
		});

		describe("service workers", () => {
			it("should register a middleware and intercept using addMiddleware", async () => {
				const scriptContent = `
			const middleware = async (request, env, _ctx, middlewareCtx) => {
				const response = await middlewareCtx.next(request, env);
				const text = await response.text();
				return new Response(text + ' world');
			}
			addMiddleware(middleware);
			addEventListener("fetch", (event) => {
				event.respondWith(new Response('Hello'));
			});
			`;
				fs.writeFileSync("index.js", scriptContent);

				const worker = await unstable_dev("index.js", {
					ip: "127.0.0.1",
					experimental: {
						disableExperimentalWarning: true,
						disableDevRegistry: true,
					},
				});

				const resp = await worker.fetch();
				let text;
				if (resp) {
					text = await resp.text();
				}
				expect(text).toMatchInlineSnapshot(`"Hello world"`);
				await worker.stop();
			});

			it("should register a middleware and intercept using addMiddlewareInternal", async () => {
				const scriptContent = `
			const middleware = async (request, env, _ctx, middlewareCtx) => {
				const response = await middlewareCtx.next(request, env);
				const text = await response.text();
				return new Response(text + ' world');
			}
			addMiddlewareInternal(middleware);
			addEventListener("fetch", (event) => {
				event.respondWith(new Response('Hello'));
			});
			`;
				fs.writeFileSync("index.js", scriptContent);

				const worker = await unstable_dev("index.js", {
					ip: "127.0.0.1",
					experimental: {
						disableExperimentalWarning: true,
						disableDevRegistry: true,
					},
				});

				const resp = await worker.fetch();
				let text;
				if (resp) {
					text = await resp.text();
				}
				expect(text).toMatchInlineSnapshot(`"Hello world"`);
				await worker.stop();
			});

			it("should be able to access scheduled workers from middleware", async () => {
				const scriptContent = `
			const middleware = async (request, env, _ctx, middlewareCtx) => {
				await middlewareCtx.dispatch("scheduled", { cron: "* * * * *" });
				return new Response("OK");
			}
			addMiddleware(middleware);
			addEventListener("scheduled", (event) => {
				// Scheduled worker called
			});
			`;

				fs.writeFileSync("index.js", scriptContent);

				const worker = await unstable_dev("index.js", {
					ip: "127.0.0.1",
					experimental: {
						disableExperimentalWarning: true,
						disableDevRegistry: true,
					},
				});

				const resp = await worker.fetch();
				let text;
				if (resp) {
					text = await resp.text();
				}
				expect(text).toMatchInlineSnapshot(`"OK"`);
				await worker.stop();
			});

			it("should trigger an error in a scheduled work from middleware", async () => {
				const scriptContent = `
				const middleware = async (request, env, _ctx, middlewareCtx) => {
					try {
						await middlewareCtx.dispatch("scheduled", { cron: "* * * * *" });
					} catch (e) {
						return new Response(e.message);
					}
				}
				addMiddleware(middleware);
				addEventListener("scheduled", (event) => {
					throw new Error("Error in scheduled worker");
				});
				`;

				fs.writeFileSync("index.js", scriptContent);

				const worker = await unstable_dev("index.js", {
					ip: "127.0.0.1",
					experimental: {
						disableExperimentalWarning: true,
						disableDevRegistry: true,
					},
				});

				const resp = await worker.fetch();
				let text;
				if (resp) {
					text = await resp.text();
				}
				expect(text).toMatchInlineSnapshot(`"Error in scheduled worker"`);
				await worker.stop();
			});
		});
	});

	describe("unchanged functionality when wrapping with middleware", () => {
		runInTempDir();

		beforeEach(() => {
			vi.stubEnv("EXPERIMENTAL_MIDDLEWARE", "true");
		});

		describe("module workers", () => {
			it("should return Hello World with no middleware export", async () => {
				const scriptContent = `
			export default {
				fetch(request, env, ctx) {
					return new Response("Hello world");
				}
			};
			`;
				fs.writeFileSync("index.js", scriptContent);

				const worker = await unstable_dev("index.js", {
					ip: "127.0.0.1",
					experimental: {
						disableExperimentalWarning: true,
						disableDevRegistry: true,
					},
				});

				const resp = await worker.fetch();
				if (resp) {
					const text = await resp.text();
					expect(text).toMatchInlineSnapshot(`"Hello world"`);
				}
				await worker.stop();
			});

			it("should return hello world with empty middleware array", async () => {
				const scriptContent = `
			export const __INJECT_FOR_TESTING_WRANGLER_MIDDLEWARE__ = []

			export default {
				fetch() {
					return new Response("Hello world");
				}
			}
			`;
				fs.writeFileSync("index.js", scriptContent);

				const worker = await unstable_dev("index.js", {
					ip: "127.0.0.1",
					experimental: {
						disableExperimentalWarning: true,
						disableDevRegistry: true,
					},
				});

				const resp = await worker.fetch();
				let text;
				if (resp) {
					text = await resp.text();
				}
				expect(text).toMatchInlineSnapshot(`"Hello world"`);
				await worker.stop();
			});

			it("should return hello world passing through middleware", async () => {
				const scriptContent = `
			const middleware = async (request, env, _ctx, middlewareCtx) => {
				return middlewareCtx.next(request, env);
			}
			export const __INJECT_FOR_TESTING_WRANGLER_MIDDLEWARE__ = [middleware]

			export default {
				fetch(request, env, ctx) {
					return new Response("Hello world");
				}
			}
			`;
				fs.writeFileSync("index.js", scriptContent);

				const worker = await unstable_dev("index.js", {
					ip: "127.0.0.1",
					experimental: {
						disableExperimentalWarning: true,
						disableDevRegistry: true,
					},
				});

				const resp = await worker.fetch();
				if (resp) {
					const text = await resp.text();
					expect(text).toMatchInlineSnapshot(`"Hello world"`);
				}
				await worker.stop();
			});

			it("should return hello world with multiple middleware in array", async () => {
				const scriptContent = `
			const middleware = async (request, env, _ctx, middlewareCtx) => {
				return middlewareCtx.next(request, env);
			}
			const middleware2 = async (request, env, _ctx, middlewareCtx) => {
				return middlewareCtx.next(request, env);
			}
			export const __INJECT_FOR_TESTING_WRANGLER_MIDDLEWARE__ = [middleware, middleware2]

			export default {
				fetch() {
					return new Response("Hello world");
				}
			}
			`;
				fs.writeFileSync("index.js", scriptContent);

				const worker = await unstable_dev("index.js", {
					ip: "127.0.0.1",
					experimental: {
						disableExperimentalWarning: true,
						disableDevRegistry: true,
					},
				});

				const resp = await worker.fetch();
				let text;
				if (resp) {
					text = await resp.text();
				}
				expect(text).toMatchInlineSnapshot(`"Hello world"`);
				await worker.stop();
			});

			it("should leave response headers unchanged with middleware", async () => {
				const scriptContent = `
			const middleware = async (request, env, _ctx, middlewareCtx) => {
				return middlewareCtx.next(request, env);
			}
			export const __INJECT_FOR_TESTING_WRANGLER_MIDDLEWARE__ = [middleware]

			export default {
				fetch() {
					return new Response("Hello world", { status: 500, headers: { "x-test": "test" } });
				}
			}
			`;
				fs.writeFileSync("index.js", scriptContent);

				const worker = await unstable_dev("index.js", {
					ip: "127.0.0.1",
					experimental: {
						disableExperimentalWarning: true,
						disableDevRegistry: true,
					},
				});

				const resp = await worker.fetch();
				const status = resp?.status;
				let text;
				if (resp) {
					text = await resp.text();
				}
				const testHeader = resp?.headers.get("x-test");
				expect(status).toEqual(500);
				expect(text).toMatchInlineSnapshot(`"Hello world"`);
				expect(testHeader).toEqual("test");
				await worker.stop();
			});

			it("waitUntil should not block responses", async () => {
				const scriptContent = `
			const middleware = async (request, env, _ctx, middlewareCtx) => {
				return middlewareCtx.next(request, env);
			}

			export const __INJECT_FOR_TESTING_WRANGLER_MIDDLEWARE__ = [middleware]

			export default {
				async fetch(request, env, ctx) {
					let count = 0;
					ctx.waitUntil(new Promise(resolve => {
						setTimeout(() => {
							count += 1;
							console.log("waitUntil", count);
							resolve()
						}, 1000);
					}));
					return new Response("Hello world" + String(count));
				}
			}
			`;
				fs.writeFileSync("index.js", scriptContent);

				const worker = await unstable_dev("index.js", {
					ip: "127.0.0.1",
					experimental: {
						disableExperimentalWarning: true,
						disableDevRegistry: true,
					},
				});

				const resp = await worker.fetch();
				let text;
				if (resp) {
					text = await resp.text();
				}
				expect(text).toMatchInlineSnapshot(`"Hello world0"`);
				await worker.stop();
			});
		});

		describe("service workers", () => {
			it("should return Hello World with no middleware export", async () => {
				const scriptContent = `
			addEventListener("fetch", (event) => {
				event.respondWith(new Response("Hello world"));
			});
			`;
				fs.writeFileSync("index.js", scriptContent);

				const worker = await unstable_dev("index.js", {
					ip: "127.0.0.1",
					experimental: {
						disableExperimentalWarning: true,
						disableDevRegistry: true,
					},
				});

				const resp = await worker.fetch();
				if (resp) {
					const text = await resp.text();
					expect(text).toMatchInlineSnapshot(`"Hello world"`);
				}
				await worker.stop();
			});

			it("should return hello world with empty middleware array", async () => {
				const scriptContent = `
			addMiddleware([]);
			addEventListener("fetch", (event) => {
				event.respondWith(new Response("Hello world"));
			});
			`;
				fs.writeFileSync("index.js", scriptContent);

				const worker = await unstable_dev("index.js", {
					ip: "127.0.0.1",
					experimental: {
						disableExperimentalWarning: true,
						disableDevRegistry: true,
					},
				});

				const resp = await worker.fetch();
				let text;
				if (resp) {
					text = await resp.text();
				}
				expect(text).toMatchInlineSnapshot(`"Hello world"`);
				await worker.stop();
			});

			it("should return hello world passing through middleware", async () => {
				const scriptContent = `
			const middleware = async (request, env, _ctx, middlewareCtx) => {
				return middlewareCtx.next(request, env);
			}
			addMiddleware(middleware);
			addEventListener("fetch", (event) => {
				event.respondWith(new Response("Hello world"));
			});
			`;
				fs.writeFileSync("index.js", scriptContent);

				const worker = await unstable_dev("index.js", {
					ip: "127.0.0.1",
					experimental: {
						disableExperimentalWarning: true,
						disableDevRegistry: true,
					},
				});

				const resp = await worker.fetch();
				if (resp) {
					const text = await resp.text();
					expect(text).toMatchInlineSnapshot(`"Hello world"`);
				}
				await worker.stop();
			});

			it("should return hello world with addMiddleware function called multiple times", async () => {
				const scriptContent = `
			const middleware = async (request, env, _ctx, middlewareCtx) => {
				return middlewareCtx.next(request, env);
			}
			const middleware2 = async (request, env, _ctx, middlewareCtx) => {
				return middlewareCtx.next(request, env);
			}
			addMiddleware(middleware);
			addMiddleware(middleware2);
			addEventListener("fetch", (event) => {
				event.respondWith(new Response("Hello world"));
			});
			`;
				fs.writeFileSync("index.js", scriptContent);

				const worker = await unstable_dev("index.js", {
					ip: "127.0.0.1",
					experimental: {
						disableExperimentalWarning: true,
						disableDevRegistry: true,
					},
				});

				const resp = await worker.fetch();
				let text;
				if (resp) {
					text = await resp.text();
				}
				expect(text).toMatchInlineSnapshot(`"Hello world"`);
				await worker.stop();
			});

			it("should return hello world with addMiddleware function called with array of middleware", async () => {
				const scriptContent = `
			const middleware = async (request, env, _ctx, middlewareCtx) => {
				return middlewareCtx.next(request, env);
			}
			const middleware2 = async (request, env, _ctx, middlewareCtx) => {
				return middlewareCtx.next(request, env);
			}
			addMiddleware(middleware, middleware2);
			addEventListener("fetch", (event) => {
				event.respondWith(new Response("Hello world"));
			});
			`;
				fs.writeFileSync("index.js", scriptContent);

				const worker = await unstable_dev("index.js", {
					ip: "127.0.0.1",
					experimental: {
						disableExperimentalWarning: true,
						disableDevRegistry: true,
					},
				});

				const resp = await worker.fetch();
				let text;
				if (resp) {
					text = await resp.text();
				}
				expect(text).toMatchInlineSnapshot(`"Hello world"`);
				await worker.stop();
			});

			it("should return hello world with addMiddlewareInternal function called multiple times", async () => {
				const scriptContent = `
			const middleware = async (request, env, _ctx, middlewareCtx) => {
				return middlewareCtx.next(request, env);
			}
			const middleware2 = async (request, env, _ctx, middlewareCtx) => {
				return middlewareCtx.next(request, env);
			}
			addMiddlewareInternal(middleware);
			addMiddlewareInternal(middleware2);
			addEventListener("fetch", (event) => {
				event.respondWith(new Response("Hello world"));
			});
			`;
				fs.writeFileSync("index.js", scriptContent);

				const worker = await unstable_dev("index.js", {
					ip: "127.0.0.1",
					experimental: {
						disableExperimentalWarning: true,
						disableDevRegistry: true,
					},
				});

				const resp = await worker.fetch();
				let text;
				if (resp) {
					text = await resp.text();
				}
				expect(text).toMatchInlineSnapshot(`"Hello world"`);
				await worker.stop();
			});

			it("should return hello world with addMiddlewareInternal function called with array of middleware", async () => {
				const scriptContent = `
			const middleware = async (request, env, _ctx, middlewareCtx) => {
				return middlewareCtx.next(request, env);
			}
			const middleware2 = async (request, env, _ctx, middlewareCtx) => {
				return middlewareCtx.next(request, env);
			}
			addMiddlewareInternal(middleware, middleware2);
			addEventListener("fetch", (event) => {
				event.respondWith(new Response("Hello world"));
			});
			`;
				fs.writeFileSync("index.js", scriptContent);

				const worker = await unstable_dev("index.js", {
					ip: "127.0.0.1",
					experimental: {
						disableExperimentalWarning: true,
						disableDevRegistry: true,
					},
				});

				const resp = await worker.fetch();
				let text;
				if (resp) {
					text = await resp.text();
				}
				expect(text).toMatchInlineSnapshot(`"Hello world"`);
				await worker.stop();
			});

			it("should return hello world with both addMiddleware and addMiddlewareInternal called", async () => {
				const scriptContent = `
			const middleware = async (request, env, _ctx, middlewareCtx) => {
				return middlewareCtx.next(request, env);
			}
			const middleware2 = async (request, env, _ctx, middlewareCtx) => {
				return middlewareCtx.next(request, env);
			}
			addMiddleware(middleware);
			addMiddlewareInternal(middleware2);
			addEventListener("fetch", (event) => {
				event.respondWith(new Response("Hello world"));
			});
			`;
				fs.writeFileSync("index.js", scriptContent);

				const worker = await unstable_dev("index.js", {
					ip: "127.0.0.1",
					experimental: {
						disableExperimentalWarning: true,
						disableDevRegistry: true,
					},
				});

				const resp = await worker.fetch();
				let text;
				if (resp) {
					text = await resp.text();
				}
				expect(text).toMatchInlineSnapshot(`"Hello world"`);
				await worker.stop();
			});

			it("should leave response headers unchanged with middleware", async () => {
				const scriptContent = `
			const middleware = async (request, env, _ctx, middlewareCtx) => {
				return middlewareCtx.next(request, env);
			}
			addEventListener("fetch", (event) => {
				event.respondWith(new Response("Hello world", { status: 500, headers: { "x-test": "test" } }));
			});
			`;
				fs.writeFileSync("index.js", scriptContent);

				const worker = await unstable_dev("index.js", {
					ip: "127.0.0.1",
					experimental: {
						disableExperimentalWarning: true,
						disableDevRegistry: true,
					},
				});

				const resp = await worker.fetch();
				const status = resp?.status;
				let text;
				if (resp) {
					text = await resp.text();
				}
				const testHeader = resp?.headers.get("x-test");
				expect(status).toEqual(500);
				expect(text).toMatchInlineSnapshot(`"Hello world"`);
				expect(testHeader).toEqual("test");
				await worker.stop();
			});

			it("should allow multiple addEventListeners for fetch", async () => {
				const scriptContent = `
			let count = 0;
			addEventListener("fetch", (event) => {
				count += 1;
			});
			addEventListener("fetch", (event) => {
				event.respondWith(new Response("Hello world" + String(count)));
			});
			`;
				fs.writeFileSync("index.js", scriptContent);

				const worker = await unstable_dev("index.js", {
					ip: "127.0.0.1",
					experimental: {
						disableExperimentalWarning: true,
						disableDevRegistry: true,
					},
				});

				const resp = await worker.fetch();
				let text;
				if (resp) {
					text = await resp.text();
				}
				expect(text).toMatchInlineSnapshot(`"Hello world1"`);
				await worker.stop();
			});

			it("waitUntil should not block responses", async () => {
				const scriptContent = `
			addEventListener("fetch", (event) => {
				let count = 0;
				event.waitUntil(new Promise((resolve) => {
					setTimeout(() => {
						count +=1;
						console.log('waitUntil', count);
						resolve();
					}, 1000);
				}));
				event.respondWith(new Response("Hello world" + String(count)));
			});
			`;
				fs.writeFileSync("index.js", scriptContent);

				const worker = await unstable_dev("index.js", {
					ip: "127.0.0.1",
					experimental: {
						disableExperimentalWarning: true,
						disableDevRegistry: true,
					},
				});

				const resp = await worker.fetch();
				let text;
				if (resp) {
					text = await resp.text();
				}
				expect(text).toMatchInlineSnapshot(`"Hello world0"`);
				await worker.stop();
			});
		});
	});

	describe("multiple middleware", () => {
		runInTempDir();

		beforeEach(() => {
			vi.stubEnv("EXPERIMENTAL_MIDDLEWARE", "true");
		});

		it("should build multiple middleware as expected", async () => {
			await seedFs({
				"src/index.js": dedent/* javascript */ `
				export default {
					async fetch(request, env) {
						return Response.json(env);
					},
				};
				export class DurableObjectExample {
					constructor(state, env) {}

					async fetch(request) {
						return new Response("Hello World");
					}
				}
			`,
				"wrangler.toml": dedent/*toml*/ `
				name = "worker-app"
				main = "src/index.js"
				compatibility_date = "2022-03-31"

				[[d1_databases]]
				binding = "DB" # i.e. available in your Worker on env.DB
				database_name = "UPDATE_THIS_FOR_REMOTE_USE"
				preview_database_id = "UPDATE_THIS_FOR_REMOTE_USE"
				database_id = "UPDATE_THIS_FOR_REMOTE_USE"

				[[migrations]]
				tag = "v1" # Should be unique for each entry
				new_classes = ["DurableObjectExample"] # Array of new classes

				[durable_objects]
				bindings = [
					{ name = "EXAMPLE_CLASS", class_name = "DurableObjectExample" } # Binding to our DurableObjectExample class
				]
			`,
			});

			await runWrangler("publish --dry-run --outdir dist");

			const fileContents = await readFile("dist/index.js", "utf8");
			expect(
				fileContents
					.replace(/\t/g, "  ")
					.replace(/\/\/ .*/g, "")
					.trim()
			).toMatchInlineSnapshot(`
				"var __defProp = Object.defineProperty;
				var __name = (target, value) => __defProp(target, \\"name\\", { value, configurable: true });


				var __defProp = Object.defineProperty;
				var __export = (target, all) => {
				  for (var name in all)
				    __defProp(target, name, { get: all[name], enumerable: true });
				};


				var src_exports = {};
				__export(src_exports, {
				  DurableObjectExample: () => DurableObjectExample,
				  default: () => src_default
				});
				var src_default = {
				  async fetch(request, env) {
				    return Response.json(env);
				  }
				};
				var DurableObjectExample = class {
				  constructor(state, env) {
				  }
				  async fetch(request) {
				    return new Response(\\"Hello World\\");
				  }
				};
				__name(DurableObjectExample, \\"DurableObjectExample\\");


				var MIDDLEWARE_TEST_INJECT = \\"__INJECT_FOR_TESTING_WRANGLER_MIDDLEWARE__\\";
				var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
				  ...src_exports[MIDDLEWARE_TEST_INJECT] ?? []
				];
				var middleware_insertion_facade_default = src_default;


				var __facade_middleware__ = [];
				function __facade_register__(...args) {
				  __facade_middleware__.push(...args.flat());
				}
				__name(__facade_register__, \\"__facade_register__\\");
				function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
				  const [head, ...tail] = middlewareChain;
				  const middlewareCtx = {
				    dispatch,
				    next(newRequest, newEnv) {
				      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
				    }
				  };
				  return head(request, env, ctx, middlewareCtx);
				}
				__name(__facade_invokeChain__, \\"__facade_invokeChain__\\");
				function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
				  return __facade_invokeChain__(request, env, ctx, dispatch, [
				    ...__facade_middleware__,
				    finalMiddleware
				  ]);
				}
				__name(__facade_invoke__, \\"__facade_invoke__\\");


				var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
				  constructor(scheduledTime, cron, noRetry) {
				    this.scheduledTime = scheduledTime;
				    this.cron = cron;
				    this.#noRetry = noRetry;
				  }
				  #noRetry;
				  noRetry() {
				    if (!(this instanceof ___Facade_ScheduledController__)) {
				      throw new TypeError(\\"Illegal invocation\\");
				    }
				    this.#noRetry();
				  }
				};
				__name(__Facade_ScheduledController__, \\"__Facade_ScheduledController__\\");
				function wrapExportedHandler(worker) {
				  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
				    return worker;
				  }
				  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
				    __facade_register__(middleware);
				  }
				  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
				    if (worker.fetch === void 0) {
				      throw new Error(\\"Handler does not export a fetch() function.\\");
				    }
				    return worker.fetch(request, env, ctx);
				  }, \\"fetchDispatcher\\");
				  return {
				    ...worker,
				    fetch(request, env, ctx) {
				      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
				        if (type === \\"scheduled\\" && worker.scheduled !== void 0) {
				          const controller = new __Facade_ScheduledController__(
				            Date.now(),
				            init.cron ?? \\"\\",
				            () => {
				            }
				          );
				          return worker.scheduled(controller, env, ctx);
				        }
				      }, \\"dispatcher\\");
				      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
				    }
				  };
				}
				__name(wrapExportedHandler, \\"wrapExportedHandler\\");
				function wrapWorkerEntrypoint(klass) {
				  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
				    return klass;
				  }
				  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
				    __facade_register__(middleware);
				  }
				  return class extends klass {
				    #fetchDispatcher = (request, env, ctx) => {
				      this.env = env;
				      this.ctx = ctx;
				      if (super.fetch === void 0) {
				        throw new Error(\\"Entrypoint class does not define a fetch() function.\\");
				      }
				      return super.fetch(request);
				    };
				    #dispatcher = (type, init) => {
				      if (type === \\"scheduled\\" && super.scheduled !== void 0) {
				        const controller = new __Facade_ScheduledController__(
				          Date.now(),
				          init.cron ?? \\"\\",
				          () => {
				          }
				        );
				        return super.scheduled(controller);
				      }
				    };
				    fetch(request) {
				      return __facade_invoke__(
				        request,
				        this.env,
				        this.ctx,
				        this.#dispatcher,
				        this.#fetchDispatcher
				      );
				    }
				  };
				}
				__name(wrapWorkerEntrypoint, \\"wrapWorkerEntrypoint\\");
				var WRAPPED_ENTRY;
				if (typeof middleware_insertion_facade_default === \\"object\\") {
				  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
				} else if (typeof middleware_insertion_facade_default === \\"function\\") {
				  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
				}
				var middleware_loader_entry_default = WRAPPED_ENTRY;
				export {
				  DurableObjectExample,
				  __INTERNAL_WRANGLER_MIDDLEWARE__,
				  middleware_loader_entry_default as default
				};
				//# sourceMappingURL=index.js.map"
			`);
		});
		it("should respond correctly with D1 databases, scheduled testing, and formatted dev errors", async () => {
			// Kitchen sink test to check interaction between multiple middlewares
			const scriptContent = `
			export default {
				async fetch(request, env, ctx) {
					const { pathname } = new URL(request.url);
					if (pathname === "/setup") {
						await env.DB.exec("CREATE TABLE IF NOT EXISTS test (id INTEGER PRIMARY KEY, value TEXT);");
						return new Response(null, { status: 204 });
					} else if (pathname === "/query") {
						const rows = await env.DB.prepare("SELECT * FROM test;").all();
						return Response.json(rows.results);
					}
					throw new Error("Not found!");
				},
				async scheduled(controller, env, ctx) {
					const stmt = await env.DB.prepare("INSERT INTO test (id, value) VALUES (?, ?)");
					await stmt.bind(1, "one").run();
				}
			}
		`;
			fs.writeFileSync("index.js", scriptContent);

			const worker = await unstable_dev("index.js", {
				ip: "127.0.0.1",
				experimental: {
					disableExperimentalWarning: true,
					disableDevRegistry: true,
					testScheduled: true,
					d1Databases: [
						{
							binding: "DB",
							database_name: "db",
							database_id: "00000000-0000-0000-0000-000000000000",
						},
					],
				},
			});

			try {
				let res = await worker.fetch("http://localhost/setup");
				expect(res.status).toBe(204);
				res = await worker.fetch("http://localhost/__scheduled");
				expect(res.status).toBe(200);
				expect(await res.text()).toBe("Ran scheduled event");
				res = await worker.fetch("http://localhost/query");
				expect(res.status).toBe(200);
				expect(await res.json()).toEqual([{ id: 1, value: "one" }]);
				res = await worker.fetch("http://localhost/bad");
				expect(res.status).toBe(500);
				// TODO: in miniflare 3 we don't have the `pretty-error` middleware implemented.
				// instead it uses `middleware-miniflare3-json-error`, which outputs JSON rather than text.
				// expect(res.headers.get("Content-Type")).toBe(
				// 	"text/html; charset=UTF-8"
				// );
				expect(await res.text()).toContain("Not found!");
			} finally {
				await worker.stop();
			}
		});
	});
});
