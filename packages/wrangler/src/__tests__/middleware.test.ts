import * as fs from "node:fs";
import { unstable_dev } from "../api";
import { runInTempDir } from "./helpers/run-in-tmp";

jest.unmock("undici");

describe("workers change behaviour with middleware with wrangler dev", () => {
	runInTempDir();

	process.env.EXPERIMENTAL_MIDDLEWARE = "true";

	describe("module workers", () => {
		it("should register a middleware and intercept", async () => {
			const scriptContent = `
			const middleware = async (request, env, _ctx, middlewareCtx) => {
				const response = await middlewareCtx.next(request, env);
				const text = await response.text();
				return new Response(text + ' world');
			}

			export default {
				middleware: [middleware],
				fetch(request, env, ctx) {
					return new Response('Hello');
				}
			};
			`;
			fs.writeFileSync("index.js", scriptContent);

			const worker = await unstable_dev("index.js", {
				experimental: {
					disableExperimentalWarning: true,
					disableDevRegistry: true,
				},
			});

			const resp = await worker.fetch();
			let text;
			if (resp) text = await resp.text();
			expect(text).toMatchInlineSnapshot(`"Hello world"`);
			await worker.stop();
		});

		it("should be able to access scheduled workers from middleware", async () => {
			const scriptContent = `
			const middleware = async (request, env, _ctx, middlewareCtx) => {
				await middlewareCtx.dispatch("scheduled", { cron: "* * * * *" });
				return new Response("OK");
			}

			export default {
				middleware: [middleware],
				scheduled(controller, env, ctx) {
					// Scheduled worker called
				}
			}
			`;

			fs.writeFileSync("index.js", scriptContent);

			const worker = await unstable_dev("index.js", {
				experimental: {
					disableExperimentalWarning: true,
					disableDevRegistry: true,
				},
			});

			const resp = await worker.fetch();
			let text;
			if (resp) text = await resp.text();
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

			export default {
				middleware: [middleware],
				scheduled(controller, env, ctx) {
					throw new Error("Error in scheduled worker");
				}
			}
			`;

			fs.writeFileSync("index.js", scriptContent);

			const worker = await unstable_dev("index.js", {
				experimental: {
					disableExperimentalWarning: true,
					disableDevRegistry: true,
				},
			});

			const resp = await worker.fetch();
			let text;
			if (resp) text = await resp.text();
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
				experimental: {
					disableExperimentalWarning: true,
					disableDevRegistry: true,
				},
			});

			const resp = await worker.fetch();
			let text;
			if (resp) text = await resp.text();
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
				experimental: {
					disableExperimentalWarning: true,
					disableDevRegistry: true,
				},
			});

			const resp = await worker.fetch();
			let text;
			if (resp) text = await resp.text();
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
				experimental: {
					disableExperimentalWarning: true,
					disableDevRegistry: true,
				},
			});

			const resp = await worker.fetch();
			let text;
			if (resp) text = await resp.text();
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
				experimental: {
					disableExperimentalWarning: true,
					disableDevRegistry: true,
				},
			});

			const resp = await worker.fetch();
			let text;
			if (resp) text = await resp.text();
			expect(text).toMatchInlineSnapshot(`"Error in scheduled worker"`);
			await worker.stop();
		});
	});
});

describe("unchanged functionality when wrapping with middleware", () => {
	runInTempDir();

	process.env.EXPERIMENTAL_MIDDLEWARE = "true";

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
			export default {
				middleware: [],
				fetch() {
					return new Response("Hello world");
				}
			}
			`;
			fs.writeFileSync("index.js", scriptContent);

			const worker = await unstable_dev("index.js", {
				experimental: {
					disableExperimentalWarning: true,
					disableDevRegistry: true,
				},
			});

			const resp = await worker.fetch();
			let text;
			if (resp) text = await resp.text();
			expect(text).toMatchInlineSnapshot(`"Hello world"`);
			await worker.stop();
		});

		it("should return hello world passing through middleware", async () => {
			const scriptContent = `
			const middleware = async (request, env, _ctx, middlewareCtx) => {
				return middlewareCtx.next(request, env);
			}

			export default {
				middleware: [middleware],
				fetch(request, env, ctx) {
					return new Response("Hello world");
				}
			}
			`;
			fs.writeFileSync("index.js", scriptContent);

			const worker = await unstable_dev("index.js", {
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


			export default {
				middleware: [middleware, middleware2],
				fetch() {
					return new Response("Hello world");
				}
			}
			`;
			fs.writeFileSync("index.js", scriptContent);

			const worker = await unstable_dev("index.js", {
				experimental: {
					disableExperimentalWarning: true,
					disableDevRegistry: true,
				},
			});

			const resp = await worker.fetch();
			let text;
			if (resp) text = await resp.text();
			expect(text).toMatchInlineSnapshot(`"Hello world"`);
			await worker.stop();
		});

		it("should leave response headers unchanged with middleware", async () => {
			const scriptContent = `
			const middleware = async (request, env, _ctx, middlewareCtx) => {
				return middlewareCtx.next(request, env);
			}

			export default {
				middleware: [middleware],
				fetch() {
					return new Response("Hello world", { status: 500, headers: { "x-test": "test" } });
				}
			}
			`;
			fs.writeFileSync("index.js", scriptContent);

			const worker = await unstable_dev("index.js", {
				experimental: {
					disableExperimentalWarning: true,
					disableDevRegistry: true,
				},
			});

			const resp = await worker.fetch();
			const status = resp?.status;
			let text;
			if (resp) text = await resp.text();
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

			export default {
				middleware: [middleware],
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
				experimental: {
					disableExperimentalWarning: true,
					disableDevRegistry: true,
				},
			});

			const resp = await worker.fetch();
			let text;
			if (resp) text = await resp.text();
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
				experimental: {
					disableExperimentalWarning: true,
					disableDevRegistry: true,
				},
			});

			const resp = await worker.fetch();
			let text;
			if (resp) text = await resp.text();
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
				experimental: {
					disableExperimentalWarning: true,
					disableDevRegistry: true,
				},
			});

			const resp = await worker.fetch();
			let text;
			if (resp) text = await resp.text();
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
				experimental: {
					disableExperimentalWarning: true,
					disableDevRegistry: true,
				},
			});

			const resp = await worker.fetch();
			let text;
			if (resp) text = await resp.text();
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
				experimental: {
					disableExperimentalWarning: true,
					disableDevRegistry: true,
				},
			});

			const resp = await worker.fetch();
			let text;
			if (resp) text = await resp.text();
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
				experimental: {
					disableExperimentalWarning: true,
					disableDevRegistry: true,
				},
			});

			const resp = await worker.fetch();
			let text;
			if (resp) text = await resp.text();
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
				experimental: {
					disableExperimentalWarning: true,
					disableDevRegistry: true,
				},
			});

			const resp = await worker.fetch();
			let text;
			if (resp) text = await resp.text();
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
				experimental: {
					disableExperimentalWarning: true,
					disableDevRegistry: true,
				},
			});

			const resp = await worker.fetch();
			const status = resp?.status;
			let text;
			if (resp) text = await resp.text();
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
				experimental: {
					disableExperimentalWarning: true,
					disableDevRegistry: true,
				},
			});

			const resp = await worker.fetch();
			let text;
			if (resp) text = await resp.text();
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
				experimental: {
					disableExperimentalWarning: true,
					disableDevRegistry: true,
				},
			});

			const resp = await worker.fetch();
			let text;
			if (resp) text = await resp.text();
			expect(text).toMatchInlineSnapshot(`"Hello world0"`);
			await worker.stop();
		});
	});
});

describe("multiple middleware", () => {
	runInTempDir();
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

		const originalFormatErrors = process.env.FORMAT_WRANGLER_ERRORS;
		process.env.FORMAT_WRANGLER_ERRORS = "true";

		const worker = await unstable_dev("index.js", {
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
			expect(res.headers.get("Content-Type")).toBe("text/html");
			expect(await res.text()).toContain("Error: Not found!");
		} finally {
			process.env.FORMAT_WRANGLER_ERRORS = originalFormatErrors;
			await worker.stop();
		}
	});
});
