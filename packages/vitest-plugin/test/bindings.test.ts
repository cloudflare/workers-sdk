import dedent from "ts-dedent";
import { test, vitestConfig } from "./helpers";

test("hello_world support", async ({ expect, seed, vitestRun }) => {
	await seed({
		"vitest.config.mts": vitestConfig({
			wrangler: { configPath: "./wrangler.jsonc" },
		}),
		"wrangler.jsonc": dedent`
			{
				"name": "test-worker",
				"compatibility_date": "2025-12-02",
				"compatibility_flags": ["nodejs_compat"],
				"unsafe_hello_world": [
					{
						"binding": "HELLO_WORLD",
					}
				]
			}
		`,
		"index.ts": dedent`
			export default {
				async fetch(request, env, ctx) {
					const value = Math.floor(Date.now() * Math.random()).toString(36);
					await env.HELLO_WORLD.set(value);

					const result = await env.HELLO_WORLD.get();
					if (value !== result.value) {
						return new Response("Value mismatch", { status: 500 });
					}

					return new Response('ok');
				}
			}
		`,
		"index.test.ts": dedent`
			import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
			import { it, expect } from "vitest";
			import worker from "./index";
			it("works", async () => {
				const request = new Request("http://example.com");
				const ctx = createExecutionContext();
				const response = await worker.fetch(request, env, ctx);
				await waitOnExecutionContext(ctx);
				expect(await response.text()).toBe("ok");
			});
		`,
	});

	const result = await vitestRun();

	await expect(result.exitCode).resolves.toBe(0);
});

test("Durable Objects may omit optional WebSocket handlers", async ({
	expect,
	seed,
	vitestRun,
}) => {
	await seed({
		"vitest.config.mts": vitestConfig({
			wrangler: { configPath: "./wrangler.jsonc" },
		}),
		"wrangler.jsonc": dedent`
			{
				"name": "test-worker",
				"main": "./index.ts",
				"compatibility_date": "2025-12-02",
				"compatibility_flags": ["nodejs_compat"],
				"durable_objects": {
					"bindings": [
						{ "name": "OPTIONAL_WS", "class_name": "OptionalWebSocketHandlers" }
					]
				},
				"migrations": [
					{ "tag": "v1", "new_sqlite_classes": ["OptionalWebSocketHandlers"] }
				]
			}
		`,
		"index.ts": dedent /* javascript */ `
			import { DurableObject } from "cloudflare:workers";

			// Defines webSocketMessage() but deliberately omits webSocketClose()
			// and webSocketError(), which workerd treats as optional handlers.
			export class OptionalWebSocketHandlers extends DurableObject {
				fetch(request) {
					if (request.headers.get("Upgrade") !== "websocket") {
						return new Response("ok");
					}
					const { 0: client, 1: server } = new WebSocketPair();
					this.ctx.acceptWebSocket(server);
					return new Response(null, { status: 101, webSocket: client });
				}

				webSocketMessage(ws, message) {
					ws.send("echo:" + message);
				}

				socketCount() {
					return this.ctx.getWebSockets().length;
				}
			}

			export default {
				async fetch() { return new Response("ok"); },
			};
		`,
		"index.test.ts": dedent /* javascript */ `
			import { env } from "cloudflare:workers";
			import { it, vi } from "vitest";

			it("echoes a message and closes without a webSocketClose() handler", async ({ expect }) => {
				const stub = env.OPTIONAL_WS.get(env.OPTIONAL_WS.idFromName("ws"));
				const response = await stub.fetch("https://example.com", {
					headers: { Upgrade: "websocket" },
				});
				const socket = response.webSocket;
				if (!socket) { throw new Error("Expected WebSocket response"); }

				const message = new Promise((resolve) => {
					socket.addEventListener("message", (event) => resolve(event.data));
				});
				socket.accept();
				socket.send("hello");
				expect(await message).toBe("echo:hello");

				// Dispatches webSocketClose() on the Durable Object, which doesn't define it
				socket.close(1000, "done");

				// Wait until the runtime has actually processed the close, so the
				// dispatch has definitely happened before the run ends
				await vi.waitFor(
					async () => {
						expect(await stub.socketCount()).toBe(0);
					},
					{ timeout: 5_000, interval: 100 }
				);
			});
		`,
	});

	const result = await vitestRun();

	await expect(result.exitCode).resolves.toBe(0);
	// Dispatching to the absent handlers must be a no-op. Previously the wrapper
	// threw "<ClassName> exported by <path> does not define a `webSocketClose()`
	// method", surfacing as an uncaught exception from the Durable Object.
	expect(result.stderr).not.toMatch("does not define");
	expect(result.stdout).not.toMatch("does not define");
});

test("adminSecretsStore seeds and reads secrets", async ({
	expect,
	seed,
	vitestRun,
}) => {
	await seed({
		"vitest.config.mts": vitestConfig({
			wrangler: { configPath: "./wrangler.jsonc" },
		}),
		"wrangler.jsonc": dedent`
				{
					"name": "test-worker",
					"compatibility_date": "2025-12-02",
					"compatibility_flags": ["nodejs_compat"],
					"secrets_store_secrets": [
						{
							"binding": "MY_SECRET",
							"secret_name": "my-secret",
							"store_id": "aaaabbbbccccdddd0000000000000000"
						}
					]
				}
			`,
		"index.test.ts": dedent`
				import { adminSecretsStore } from "cloudflare:test";
				import { env } from "cloudflare:workers";
				import { it } from "vitest";

				it("create, update, list, and delete a secret", async ({ expect }) => {
					const admin = adminSecretsStore(env.MY_SECRET);

					// create
					const id = await admin.create("initial-value");
					expect(typeof id).toBe("string");
					expect(await env.MY_SECRET.get()).toBe("initial-value");

					// update
					await admin.update("updated-value", id);
					expect(await env.MY_SECRET.get()).toBe("updated-value");

					// list
					const secrets = await admin.list();
					expect(secrets.length).toBeGreaterThan(0);

					// delete
					await admin.delete(id);
					try {
						await env.MY_SECRET.get();
						expect.unreachable("expected get() to throw after delete");
					} catch (e) {
						expect(String(e)).toContain("not found");
					}
				});
			`,
	});

	const result = await vitestRun();
	await expect(result.exitCode).resolves.toBe(0);
});
