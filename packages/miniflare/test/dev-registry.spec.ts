import { Miniflare, MiniflareOptions, WorkerRegistry } from "miniflare";
import { describe, expect, onTestFinished, test, vi } from "vitest";
import { useDispose, useTmp } from "./test-shared";

describe.sequential("DevRegistry", () => {
	test("fetch to service worker", async () => {
		const unsafeDevRegistryPath = await useTmp();
		const remote = new Miniflare({
			name: "remote-worker",
			unsafeDevRegistryPath,
			compatibilityFlags: ["experimental"],
			script: `addEventListener("fetch", (event) => {
				event.respondWith(new Response("Hello from service worker!"));
			})`,
			unsafeDirectSockets: [
				{
					entrypoint: undefined,
					proxy: true,
				},
			],
		});

		await remote.ready;

		const local = new Miniflare({
			name: "local-worker",
			unsafeDevRegistryPath,
			serviceBindings: {
				SERVICE: {
					name: "remote-worker",
				},
			},
			compatibilityFlags: ["experimental"],
			modules: true,
			script: `
				export default {
					async fetch(request, env, ctx) {
						return await env.SERVICE.fetch(request);
					}
				}
			`,
		});
		useDispose(local);

		const res = await local.dispatchFetch("http://placeholder");

		expect(await res.text()).toBe("Hello from service worker!");
		expect(res.status).toBe(200);

		// Kill the remote worker to see if it fails gracefully
		await remote.dispose();
		await vi.waitFor(
			async () => {
				const res = await local.dispatchFetch("http://placeholder");

				expect(await res.text()).toBe(
					`Couldn\'t find a local dev session for the "default" entrypoint of service "remote-worker" to proxy to`
				);
				expect(res.status).toBe(503);
			},
			{ timeout: 10_000, interval: 100 }
		);
	});

	test("fetch to module worker", async () => {
		const unsafeDevRegistryPath = await useTmp();
		const local = new Miniflare({
			name: "local-worker",
			unsafeDevRegistryPath,
			serviceBindings: {
				SERVICE: {
					name: "remote-worker",
				},
			},
			compatibilityFlags: ["experimental"],
			modules: true,
			script: `
				export default {
					async fetch(request, env, ctx) {
						const response = await env.SERVICE.fetch(request.url);
						const text = await response.text();

						return new Response("Response from remote worker: " + text, {
							status: response.status,
						});
					}
				}
			`,
		});
		useDispose(local);

		const res = await local.dispatchFetch("http://example.com?name=World");
		expect(await res.text()).toBe(
			`Response from remote worker: Couldn\'t find a local dev session for the "default" entrypoint of service "remote-worker" to proxy to`
		);
		expect(res.status).toBe(503);

		const remote = new Miniflare({
			name: "remote-worker",
			unsafeDevRegistryPath,
			compatibilityFlags: ["experimental"],
			modules: true,
			script: `
				export default {
					async fetch(request, env, ctx) {
	                    const url = new URL(request.url);
	                    const name = url.searchParams.get("name") ?? 'anonymous';

						return new Response("Hello " + name);
					}
				}
			`,
			unsafeDirectSockets: [
				{
					entrypoint: undefined,
					proxy: true,
				},
			],
		});
		useDispose(remote);

		await remote.ready;
		await vi.waitFor(
			async () => {
				const res = await local.dispatchFetch("http://example.com?name=World");
				const result = await res.text();
				expect(result).toBe("Response from remote worker: Hello World");
				expect(res.status).toBe(200);
			},
			{ timeout: 10_000, interval: 100 }
		);
	});

	test("WebSocket upgrade to module worker", async () => {
		const unsafeDevRegistryPath = await useTmp();
		const local = new Miniflare({
			name: "local-worker",
			unsafeDevRegistryPath,
			serviceBindings: {
				SERVICE: {
					name: "remote-worker",
				},
			},
			compatibilityFlags: ["experimental"],
			modules: true,
			script: `
				export default {
					async fetch(request, env, ctx) {
						const wsResponse = await env.SERVICE.fetch(request.url, {
							headers: { Upgrade: "websocket" }
						});

						if (wsResponse.webSocket) {
							wsResponse.webSocket.accept();

							const messagePromise = new Promise((resolve) => {
								wsResponse.webSocket.addEventListener("message", (event) => {
									resolve(event.data);
								});
							});

							// Test bidirectional communication
							wsResponse.webSocket.send("ping");

							const response = await messagePromise;

							return new Response(\`WebSocket communication successful: \${response}\`, {
								status: 200,
							});
						}

						return new Response("WebSocket upgrade failed", {
							status: 500,
						});
					}
				}
			`,
		});
		useDispose(local);

		const remote = new Miniflare({
			name: "remote-worker",
			unsafeDevRegistryPath,
			compatibilityFlags: ["experimental"],
			modules: true,
			script: `
				export default {
					async fetch(request, env, ctx) {
						// Handle WebSocket upgrade requests
						if (request.headers.get("Upgrade") === "websocket") {
							const [server, client] = Object.values(new WebSocketPair());
							server.accept();

							server.addEventListener("message", (event) => {
								// Echo back with a response to test bidirectional communication
								if (event.data === "ping") {
									server.send("pong");
								}
							});

							return new Response(null, { status: 101, webSocket: client });
						}

						// This test only focuses on WebSocket, no HTTP handling needed
						return new Response("Not a WebSocket request", { status: 400 });
					}
				}
			`,
			unsafeDirectSockets: [
				{
					entrypoint: undefined,
					proxy: true,
				},
			],
		});
		useDispose(remote);

		await remote.ready;
		await vi.waitFor(
			async () => {
				const res = await local.dispatchFetch("http://example.com");
				const result = await res.text();
				expect(result).toBe("WebSocket communication successful: pong");
				expect(res.status).toBe(200);
			},
			{ timeout: 10_000, interval: 100 }
		);
	});

	test("RPC to default entrypoint", async () => {
		const unsafeDevRegistryPath = await useTmp();
		const local = new Miniflare({
			name: "local-worker",
			unsafeDevRegistryPath,
			serviceBindings: {
				SERVICE: {
					name: "remote-worker",
				},
			},
			compatibilityFlags: ["experimental"],
			modules: true,
			script: `
				export default {
					async fetch(request, env, ctx) {
						try {
	                        const result = await env.SERVICE.ping();
	                        return new Response("Response from remote worker: " + result);
	                    } catch (e) {
	                        return new Response(e.message, { status: 500 });
	                    }
					}
				}
			`,
		});
		useDispose(local);

		const res = await local.dispatchFetch("http://placeholder");
		expect(await res.text()).toBe(
			`Cannot access "ping" as we couldn\'t find a local dev session for the "default" entrypoint of service "remote-worker" to proxy to.`
		);
		expect(res.status).toBe(500);

		const remote = new Miniflare({
			name: "remote-worker",
			unsafeDevRegistryPath,
			compatibilityFlags: ["experimental"],
			modules: true,
			script: `
				import { WorkerEntrypoint } from "cloudflare:workers";
				export default class TestEntrypoint extends WorkerEntrypoint {
					ping() { return "pong"; }
				}
			`,
			unsafeDirectSockets: [
				{
					entrypoint: undefined,
					proxy: true,
				},
			],
		});

		await remote.ready;
		await vi.waitFor(
			async () => {
				const res = await local.dispatchFetch("http://placeholder");
				const result = await res.text();
				expect(result).toBe("Response from remote worker: pong");
			},
			{ timeout: 10_000, interval: 100 }
		);

		// Kill the remote worker to see if it fails gracefully
		await remote.dispose();
		await vi.waitFor(
			async () => {
				const res = await local.dispatchFetch("http://placeholder");
				expect(await res.text()).toBe(
					`Cannot access "ping" as we couldn\'t find a local dev session for the "default" entrypoint of service "remote-worker" to proxy to.`
				);
				expect(res.status).toBe(500);
			},
			{ timeout: 10_000, interval: 100 }
		);
	});

	test("RPC to custom entrypoint", async () => {
		const unsafeDevRegistryPath = await useTmp();
		const local = new Miniflare({
			name: "local-worker",
			unsafeDevRegistryPath,
			serviceBindings: {
				SERVICE: {
					name: "remote-worker",
					entrypoint: "TestEntrypoint",
				},
			},
			compatibilityFlags: ["experimental"],
			modules: true,
			script: `
				export default {
					async fetch(request, env, ctx) {
	                    try {
	                        const result = await env.SERVICE.ping();
	                        return new Response("Response from remote worker: " + result);
	                    } catch (e) {
	                        return new Response(e.message, { status: 500 });
	                    }
					}
				}
			`,
		});
		useDispose(local);

		const res = await local.dispatchFetch("http://placeholder");
		expect(await res.text()).toBe(
			`Cannot access "ping" as we couldn\'t find a local dev session for the "TestEntrypoint" entrypoint of service "remote-worker" to proxy to.`
		);
		expect(res.status).toBe(500);

		const remote = new Miniflare({
			name: "remote-worker",
			unsafeDevRegistryPath,
			compatibilityFlags: ["experimental"],
			modules: true,
			script: `
				import { WorkerEntrypoint } from "cloudflare:workers";
				export class TestEntrypoint extends WorkerEntrypoint {
					ping() { return "pong"; }
				}
			`,
			unsafeDirectSockets: [
				{
					entrypoint: "TestEntrypoint",
					proxy: true,
				},
			],
		});

		await remote.ready;
		await vi.waitFor(
			async () => {
				const res = await local.dispatchFetch("http://placeholder");
				const result = await res.text();
				expect(result).toBe("Response from remote worker: pong");
			},
			{ timeout: 10_000, interval: 100 }
		);

		await remote.dispose();
		await vi.waitFor(
			async () => {
				const res = await local.dispatchFetch("http://placeholder");
				expect(await res.text()).toBe(
					`Cannot access "ping" as we couldn\'t find a local dev session for the "TestEntrypoint" entrypoint of service "remote-worker" to proxy to.`
				);
				expect(res.status).toBe(500);
			},
			{ timeout: 10_000, interval: 100 }
		);
	});

	test("fetch to module worker with node bindings", async () => {
		const unsafeDevRegistryPath = await useTmp();
		const local = new Miniflare({
			name: "local-worker",
			unsafeDevRegistryPath,
			serviceBindings: {
				SERVICE: {
					name: "remote-worker",
				},
			},
			compatibilityFlags: ["experimental"],
			modules: true,
			script: `
				export default {
					async fetch(request, env, ctx) {
						return new Response("Not implemented", { status: 501 });
					}
				}
			`,
		});
		useDispose(local);

		const bindings = await local.getBindings<Record<string, any>>();

		await vi.waitFor(
			async () => {
				const res = await bindings.SERVICE.fetch(
					"http://example.com?name=World"
				);
				expect(await res.text()).toBe(
					`Couldn\'t find a local dev session for the "default" entrypoint of service "remote-worker" to proxy to`
				);
				expect(res.status).toBe(503);
			},
			{ timeout: 10_000, interval: 100 }
		);

		const remote = new Miniflare({
			name: "remote-worker",
			unsafeDevRegistryPath,
			compatibilityFlags: ["experimental"],
			modules: true,
			script: `
				export default {
					async fetch(request, env, ctx) {
	                    const url = new URL(request.url);
	                    const name = url.searchParams.get("name") ?? 'anonymous';

						return new Response("Hello " + name);
					}
				}
			`,
			unsafeDirectSockets: [
				{
					entrypoint: undefined,
					proxy: true,
				},
			],
		});

		await remote.ready;
		await vi.waitFor(
			async () => {
				const res = await bindings.SERVICE.fetch(
					"http://example.com?name=World"
				);
				const result = await res.text();
				expect(result).toBe("Hello World");
				expect(res.status).toBe(200);
			},
			{ timeout: 10_000, interval: 100 }
		);

		await remote.dispose();
		await vi.waitFor(
			async () => {
				const res = await bindings.SERVICE.fetch(
					"http://example.com?name=World"
				);
				expect(await res.text()).toBe(
					`Couldn\'t find a local dev session for the "default" entrypoint of service "remote-worker" to proxy to`
				);
				expect(res.status).toBe(503);
			},
			{ timeout: 10_000, interval: 100 }
		);
	});

	test("RPC to default entrypoint with node bindings", async () => {
		const unsafeDevRegistryPath = await useTmp();
		const local = new Miniflare({
			name: "local-worker",
			unsafeDevRegistryPath,
			serviceBindings: {
				SERVICE: {
					name: "remote-worker",
				},
			},
			compatibilityFlags: ["experimental"],
			modules: true,
			script: `
				export default {
					async fetch(request, env, ctx) {
						return new Response("Not implemented", { status: 501 });
					}
				}
			`,
		});
		useDispose(local);

		const env = await local.getBindings<Record<string, any>>();

		await vi.waitFor(
			async () => {
				try {
					const result = await env.SERVICE.ping();
					throw new Error(`Expected error, got result: ${result}`);
				} catch (e) {
					expect(e instanceof Error ? e.message : `${e}`).toBe(
						`Cannot access "ping" as we couldn\'t find a local dev session for the "default" entrypoint of service "remote-worker" to proxy to.`
					);
				}
			},
			{ timeout: 10_000, interval: 100 }
		);

		const remote = new Miniflare({
			name: "remote-worker",
			unsafeDevRegistryPath,
			compatibilityFlags: ["experimental"],
			modules: true,
			script: `
				import { WorkerEntrypoint } from "cloudflare:workers";
				export default class TestEntrypoint extends WorkerEntrypoint {
					ping() { return "pong"; }
				}
			`,
			unsafeDirectSockets: [
				{
					entrypoint: undefined,
					proxy: true,
				},
			],
		});

		await remote.ready;
		await vi.waitFor(
			async () => {
				const result = await env.SERVICE.ping();
				expect(result).toBe("pong");
			},
			{ timeout: 10_000, interval: 100 }
		);

		// Kill the remote worker to see if it fails gracefully
		await remote.dispose();
		await vi.waitFor(
			async () => {
				try {
					const result = await env.SERVICE.ping();
					throw new Error(`Expected error, got result: ${result}`);
				} catch (e) {
					expect(e instanceof Error ? e.message : `${e}`).toBe(
						`Cannot access "ping" as we couldn\'t find a local dev session for the "default" entrypoint of service "remote-worker" to proxy to.`
					);
				}
			},
			{ timeout: 10_000, interval: 100 }
		);
	});

	test("fetch to durable object with do proxy disabled", async () => {
		const unsafeDevRegistryPath = await useTmp();
		const remote = new Miniflare({
			name: "remote-worker",
			unsafeDevRegistryPath,
			unsafeDevRegistryDurableObjectProxy: false,
			compatibilityFlags: ["experimental"],
			durableObjects: {
				DO: {
					className: "MyDurableObject",
				},
			},
			modules: true,
			script: `
				import { DurableObject } from "cloudflare:workers";
				export class MyDurableObject extends DurableObject {
					fetch() {
						return new Response('Hello from Durable Object!');
					}
				};

				export default {
					async fetch(request, env, ctx) {
	                    return new Response("Hello from the default Worker Entrypoint!");
					}
				}
			`,
		});
		useDispose(remote);

		await remote.ready;

		const local = new Miniflare({
			name: "local-worker",
			unsafeDevRegistryPath,
			unsafeDevRegistryDurableObjectProxy: false,
			durableObjects: {
				DO: {
					className: "MyDurableObject",
					scriptName: "remote-worker",
				},
			},
			compatibilityFlags: ["experimental"],
			modules: true,
			script: `
				export default {
					async fetch(request, env, ctx) {
		                const ns = env.DO;
						const id = ns.newUniqueId();
						const stub = ns.get(id);
						return stub.fetch(request);
					}
				}
			`,
		});
		useDispose(local);

		const res = await local.dispatchFetch("http://placeholder");
		const result = await res.text();
		expect(result).toBe("Service Unavailable");
		expect(res.status).toBe(503);
	});

	test("RPC to durable object with do proxy disabled", async () => {
		const unsafeDevRegistryPath = await useTmp();
		const remote = new Miniflare({
			name: "remote-worker",
			unsafeDevRegistryPath,
			unsafeDevRegistryDurableObjectProxy: false,
			compatibilityFlags: ["experimental"],
			durableObjects: {
				DO: {
					className: "MyDurableObject",
				},
			},
			modules: true,
			script: `
				import { DurableObject } from "cloudflare:workers";
				export class MyDurableObject extends DurableObject {
					ping() {
						return "pong";
					}
				};
			`,
		});
		useDispose(remote);

		await remote.ready;

		const local = new Miniflare({
			name: "local-worker",
			unsafeDevRegistryPath,
			unsafeDevRegistryDurableObjectProxy: false,
			durableObjects: {
				DO: {
					className: "MyDurableObject",
					scriptName: "remote-worker",
				},
			},
			compatibilityFlags: ["experimental"],
			modules: true,
			script: `
				export default {
					async fetch(request, env, ctx) {
						try {
							const ns = env.DO;
							const id = ns.newUniqueId();
							const stub = ns.get(id);
							const result = await stub.ping();

							return new Response(result);
						} catch (ex) {
							return new Response(ex.message, { status: 500 });
						}
					}
				}
			`,
		});
		useDispose(local);

		const res = await local.dispatchFetch("http://placeholder");
		const result = await res.text();
		expect(result).toBe(
			`Couldn't find the durable Object "MyDurableObject" of script "remote-worker".`
		);
		expect(res.status).toBe(500);
	});

	test("fetch to durable object", async () => {
		const unsafeDevRegistryPath = await useTmp();
		const local = new Miniflare({
			name: "local-worker",
			unsafeDevRegistryPath,
			unsafeDevRegistryDurableObjectProxy: true,
			durableObjects: {
				DO: {
					className: "MyDurableObject",
					scriptName: "remote-worker",
				},
			},
			compatibilityFlags: ["experimental"],
			modules: true,
			script: `
				export default {
					async fetch(request, env, ctx) {
		                const ns = env.DO;
						const id = ns.newUniqueId();
						const stub = ns.get(id);
						const response = await stub.fetch(request);

						return response;
					}
				}
			`,
		});
		useDispose(local);

		const res = await local.dispatchFetch("http://placeholder");
		expect(await res.text()).toBe("Service Unavailable");
		expect(res.status).toBe(503);

		const remote = new Miniflare({
			name: "remote-worker",
			unsafeDevRegistryPath,
			unsafeDevRegistryDurableObjectProxy: true,
			compatibilityFlags: ["experimental"],
			durableObjects: {
				DO: {
					className: "MyDurableObject",
				},
			},
			modules: true,
			script: `
				import { DurableObject } from "cloudflare:workers";
				export class MyDurableObject extends DurableObject {
					fetch() {
						return new Response('Hello from Durable Object!');
					}
				};

				export default {
					async fetch(request, env, ctx) {
	                    return new Response("Hello from the default Worker Entrypoint!");
					}
				}
			`,
		});
		useDispose(remote);

		await remote.ready;
		await vi.waitFor(
			async () => {
				const res = await local.dispatchFetch("http://placeholder");
				expect(await res.text()).toBe("Hello from Durable Object!");
				expect(res.status).toBe(200);
			},
			{ timeout: 10_000, interval: 100 }
		);
	});

	test("RPC to durable object", async () => {
		const unsafeDevRegistryPath = await useTmp();
		const local = new Miniflare({
			name: "local-worker",
			unsafeDevRegistryPath,
			unsafeDevRegistryDurableObjectProxy: true,
			durableObjects: {
				DO: {
					className: "MyDurableObject",
					scriptName: "remote-worker",
				},
			},
			compatibilityFlags: ["experimental"],
			modules: true,
			script: `
				export default {
					async fetch(request, env, ctx) {
						try {
							const ns = env.DO;
							const id = ns.newUniqueId();
							const stub = ns.get(id);
							const result = await stub.ping();

							return new Response("Response from remote worker: " + result);
						} catch (ex) {
							return new Response(ex.message, { status: 500 });
						}
					}
				}
			`,
		});
		useDispose(local);

		const res = await local.dispatchFetch("http://placeholder");
		expect(await res.text()).toBe(
			`Cannot access "MyDurableObject#ping" as Durable Object RPC is not yet supported between multiple dev sessions.`
		);
		expect(res.status).toBe(500);

		const remote = new Miniflare({
			name: "remote-worker",
			unsafeDevRegistryPath,
			unsafeDevRegistryDurableObjectProxy: true,
			compatibilityFlags: ["experimental"],
			durableObjects: {
				DO: {
					className: "MyDurableObject",
				},
			},
			modules: true,
			script: `
				import { DurableObject } from "cloudflare:workers";
				export class MyDurableObject extends DurableObject {
					ping() {
						return "pong";
					}
				};
			`,
		});
		useDispose(remote);

		await remote.ready;
		await vi.waitFor(
			async () => {
				const res = await local.dispatchFetch("http://placeholder");
				expect(await res.text()).toBe(
					`Cannot access "MyDurableObject#ping" as Durable Object RPC is not yet supported between multiple dev sessions.`
				);
				expect(res.status).toBe(500);
			},
			{ timeout: 10_000, interval: 100 }
		);
	});

	test("tail to default entrypoint", async () => {
		const unsafeDevRegistryPath = await useTmp();
		const remote = new Miniflare({
			name: "remote-worker",
			unsafeDevRegistryPath,
			compatibilityFlags: ["experimental"],
			modules: true,
			script: `
				let resolve, reject;
				const promise = new Promise((res, rej) => {
					resolve = res;
					reject = rej;
				});
				export default {
					async fetch() {
						try {
							const event = await Promise.race([
								promise,
								new Promise((_, cancel) => setTimeout(cancel, 1000))
							]);
							return Response.json(event[0].logs[0].message);
						} catch {
							return new Response("No tail event received", { status: 500 });
						}
					},
					tail(e) {
						resolve(e);
					}
				};
			`,
			unsafeDirectSockets: [
				{
					entrypoint: undefined,
					proxy: true,
				},
			],
		});
		useDispose(remote);

		await remote.ready;

		const local = new Miniflare({
			name: "local-worker",
			unsafeDevRegistryPath,
			tails: ["remote-worker"],
			serviceBindings: {
				remote: "remote-worker",
			},
			handleRuntimeStdio: () => {},
			compatibilityFlags: ["experimental"],
			modules: true,
			script: `
				export default {
					async fetch(request, env) {
						if (request.url.includes("remote-worker")) {
							return env.remote.fetch(request)
						}
						console.log("DevReg: log event")
						return new Response("Hello from local-worker!");
					}
				}
			`,
		});
		useDispose(local);

		const res = await local.dispatchFetch("http://example.com");
		const result = await res.text();
		expect(result).toBe("Hello from local-worker!");

		const res2 = await local.dispatchFetch("http://example.com/remote-worker");
		const result2 = await res2.text();

		expect(result2).toEqual(`["DevReg: log event"]`);
	});

	test("tail to unknown worker", async () => {
		const unsafeDevRegistryPath = await useTmp();
		const mf = new Miniflare({
			name: "local-worker",
			unsafeDevRegistryPath,
			tails: ["remote-worker"],
			serviceBindings: {
				remote: "remote-worker",
			},
			compatibilityFlags: ["experimental"],
			modules: true,
			handleRuntimeStdio: () => {},
			script: `
				export default {
					async fetch(request, env) {
						if (request.url.includes("remote-worker")) {
							return env.remote.fetch(request)
						}
						console.log("DevReg: log event 2")
						return new Response("Hello from local-worker!");
					}
				}
			`,
		});
		useDispose(mf);

		const res = await mf.dispatchFetch("http://example.com");
		const result = await res.text();
		expect(result).toBe("Hello from local-worker!");

		const res2 = await mf.dispatchFetch("http://example.com/remote-worker");
		const result2 = await res2.text();

		expect(result2).toEqual(
			`Couldn\'t find a local dev session for the "default" entrypoint of service "remote-worker" to proxy to`
		);
	});

	test("miniflare with different registry path", async () => {
		const unsafeDevRegistryPath = await useTmp();
		const unsafeDevRegistryPath2 = await useTmp();
		const localOptions: MiniflareOptions = {
			name: "local-worker",
			serviceBindings: {
				SERVICE: {
					name: "remote-worker",
				},
			},
			compatibilityFlags: ["experimental"],
			modules: true,
			script: `
				export default {
					async fetch(request, env, ctx) {
						try {
	                        const result = await env.SERVICE.ping();
	                        return new Response("Response from remote worker: " + result);
	                    } catch (e) {
	                        return new Response(e.message, { status: 500 });
	                    }
					}
				}
			`,
		};
		const remoteOptions: MiniflareOptions = {
			name: "remote-worker",
			compatibilityFlags: ["experimental"],
			modules: true,
			script: `
				import { WorkerEntrypoint } from "cloudflare:workers";
				export default class TestEntrypoint extends WorkerEntrypoint {
					ping() { return "pong"; }
				}
			`,
			unsafeDirectSockets: [
				{
					entrypoint: undefined,
					proxy: true,
				},
			],
		};

		const local = new Miniflare({
			...localOptions,
			unsafeDevRegistryPath,
		});
		useDispose(local);

		const res = await local.dispatchFetch("http://placeholder");
		expect(await res.text()).toBe(
			`Cannot access "ping" as we couldn\'t find a local dev session for the "default" entrypoint of service "remote-worker" to proxy to.`
		);
		expect(res.status).toBe(500);

		const remote = new Miniflare({
			...remoteOptions,
			unsafeDevRegistryPath,
		});
		useDispose(remote);

		await remote.ready;
		await vi.waitFor(
			async () => {
				const res = await local.dispatchFetch("http://placeholder");
				const result = await res.text();
				expect(result).toBe("Response from remote worker: pong");
			},
			{ timeout: 10_000, interval: 100 }
		);

		// Change remote's registry path to a different value
		await remote.setOptions({
			...remoteOptions,
			unsafeDevRegistryPath: unsafeDevRegistryPath2,
		});
		await vi.waitFor(
			async () => {
				const res = await local.dispatchFetch("http://placeholder");
				expect(await res.text()).toBe(
					`Cannot access "ping" as we couldn\'t find a local dev session for the "default" entrypoint of service "remote-worker" to proxy to.`
				);
				expect(res.status).toBe(500);
			},
			{ timeout: 10_000, interval: 100 }
		);

		// Change local's registry path to the same path as remote's
		await local.setOptions({
			...localOptions,
			unsafeDevRegistryPath: unsafeDevRegistryPath2,
		});
		await vi.waitFor(
			async () => {
				const res = await local.dispatchFetch("http://placeholder");
				const result = await res.text();
				expect(result).toBe("Response from remote worker: pong");
			},
			{ timeout: 10_000, interval: 100 }
		);
	});

	test("fetch to module worker with https enabled", async () => {
		const unsafeDevRegistryPath = await useTmp();
		const local = new Miniflare({
			name: "local-worker",
			unsafeDevRegistryPath,
			serviceBindings: {
				SERVICE: {
					name: "remote-worker",
				},
			},
			compatibilityFlags: ["experimental"],
			modules: true,
			script: `
				export default {
					async fetch(request, env, ctx) {
						const response = await env.SERVICE.fetch(request.url);
						const text = await response.text();

						return new Response("Response from remote worker: " + text, {
							status: response.status,
						});
					}
				}
			`,
		});
		useDispose(local);

		const res = await local.dispatchFetch("https://example.com?name=World");

		expect(await res.text()).toBe(
			`Response from remote worker: Couldn\'t find a local dev session for the "default" entrypoint of service "remote-worker" to proxy to`
		);
		expect(res.status).toBe(503);

		const remote = new Miniflare({
			name: "remote-worker",
			unsafeDevRegistryPath,
			compatibilityFlags: ["experimental"],
			modules: true,
			https: true,
			script: `
				export default {
					async fetch(request, env, ctx) {
		                const url = new URL(request.url);
		                const name = url.searchParams.get("name") ?? 'anonymous';

						return new Response("Hello " + name);
					}
				}
			`,
			// No direct sockets so that local will connect to the entry worker instead
		});
		useDispose(remote);

		await remote.ready;
		await vi.waitFor(
			async () => {
				const res = await local.dispatchFetch("https://example.com?name=World");
				const result = await res.text();
				expect(result).toBe("Response from remote worker: Hello World");
				expect(res.status).toBe(200);
			},
			{ timeout: 10_000, interval: 100 }
		);
	});

	test("fetch to durable object with https enabled", async () => {
		const unsafeDevRegistryPath = await useTmp();
		const local = new Miniflare({
			name: "local-worker",
			unsafeDevRegistryPath,
			unsafeDevRegistryDurableObjectProxy: true,
			durableObjects: {
				DO: {
					className: "MyDurableObject",
					scriptName: "remote-worker",
				},
			},
			compatibilityFlags: ["experimental"],
			modules: true,
			script: `
				export default {
					async fetch(request, env, ctx) {
		                const ns = env.DO;
						const id = ns.newUniqueId();
						const stub = ns.get(id);
						const response = await stub.fetch(request);

						return response;
					}
				}
			`,
		});
		useDispose(local);

		const res = await local.dispatchFetch("http://placeholder");
		expect(await res.text()).toBe("Service Unavailable");
		expect(res.status).toBe(503);

		const remote = new Miniflare({
			name: "remote-worker",
			unsafeDevRegistryPath,
			unsafeDevRegistryDurableObjectProxy: true,
			https: true,
			compatibilityFlags: ["experimental"],
			durableObjects: {
				DO: {
					className: "MyDurableObject",
				},
			},
			modules: true,
			script: `
				import { DurableObject } from "cloudflare:workers";
				export class MyDurableObject extends DurableObject {
					fetch() {
						return new Response('Hello from Durable Object!');
					}
				};

				export default {
					async fetch(request, env, ctx) {
	                    return new Response("Hello from the default Worker Entrypoint!");
					}
				}
			`,
		});
		useDispose(remote);

		await remote.ready;
		await vi.waitFor(
			async () => {
				const res = await local.dispatchFetch("http://placeholder");
				expect(await res.text()).toBe("Hello from Durable Object!");
				expect(res.status).toBe(200);
			},
			{ timeout: 10_000, interval: 100 }
		);
	});

	test("handleDevRegistryUpdate callback", async () => {
		const unsafeDevRegistryPath = await useTmp();
		const firstCallbackInvocations: Array<{
			registry: WorkerRegistry;
		}> = [];
		const secondCallbackInvocations: Array<{
			registry: WorkerRegistry;
		}> = [];

		// Create local Worker with service binding and callback
		const local = new Miniflare({
			name: "local-worker",
			unsafeDevRegistryPath,
			unsafeHandleDevRegistryUpdate(registry) {
				firstCallbackInvocations.push({ registry });
			},
			serviceBindings: {
				SERVICE: {
					name: "remote-worker",
				},
			},
			compatibilityFlags: ["experimental"],
			modules: true,
			script: `
				export default {
					async fetch(request, env, ctx) {
						try {
							const result = await env.SERVICE.ping();
							return new Response("Response from remote Worker: " + result);
						} catch (e) {
							return new Response(e.message, { status: 500 });
						}
					}
				}
			`,
		});
		useDispose(local);

		// Callback should not be triggered initially since no external services exist
		expect(firstCallbackInvocations.length).toBe(0);
		expect(secondCallbackInvocations.length).toBe(0);

		// Create an unrelated Worker - callback should NOT be triggered
		const unrelated = new Miniflare({
			name: "unrelated-worker",
			unsafeDevRegistryPath,
			compatibilityFlags: ["experimental"],
			modules: true,
			script: `
				export default {
					async fetch() {
						return new Response("Hello from unrelated-worker!");
					}
				}
			`,
			unsafeDirectSockets: [
				{
					entrypoint: undefined,
					proxy: true,
				},
			],
		});
		useDispose(unrelated);

		await unrelated.ready;

		// Callback should not be triggered since we're not bound to unrelated-worker
		expect(firstCallbackInvocations.length).toBe(0);
		expect(secondCallbackInvocations.length).toBe(0);

		// Create remote worker (one we're actually bound to) - this should trigger the callback
		const remote = new Miniflare({
			name: "remote-worker",
			unsafeDevRegistryPath,
			compatibilityFlags: ["experimental"],
			modules: true,
			script: `
				import { WorkerEntrypoint } from "cloudflare:workers";
				export default class TestEntrypoint extends WorkerEntrypoint {
					ping() { return "pong"; }
				}
			`,
			unsafeDirectSockets: [
				{
					entrypoint: undefined,
					proxy: true,
				},
			],
		});
		onTestFinished(async () => {
			try {
				await remote.dispose();
			} catch {
				// Ignore if already disposed
			}
		});

		await remote.ready;

		// Wait for the callback to be triggered
		await vi.waitFor(
			async () => {
				// Callback should be triggered when bound Worker starts
				expect(firstCallbackInvocations.length).toBe(1);
				// Second callback should not be triggered yet
				expect(secondCallbackInvocations.length).toBe(0);
			},
			{ timeout: 10_000, interval: 100 }
		);

		// Verify the callback was called with the correct registry data
		await vi.waitFor(
			async () => {
				const latestInvocation = firstCallbackInvocations.at(-1);
				// Registry should contain remote-worker
				expect(latestInvocation?.registry["remote-worker"]).toBeDefined();
			},
			{ timeout: 10_000, interval: 100 }
		);

		// Update unsafeHandleDevRegistryUpdate callback to push to a different array
		await local.setOptions({
			name: "local-worker",
			unsafeDevRegistryPath,
			unsafeHandleDevRegistryUpdate(registry) {
				secondCallbackInvocations.push({
					registry,
				});
			},
			serviceBindings: {
				SERVICE: {
					name: "remote-worker",
				},
			},
			compatibilityFlags: ["experimental"],
			modules: true,
			script: `
				export default {
					async fetch(request, env, ctx) {
						try {
							const result = await env.SERVICE.ping();
							return new Response("Response from updated local Worker: " + result);
						} catch (e) {
							return new Response(e.message, { status: 500 });
						}
					}
				}
			`,
		});

		// Test disposal
		await remote.dispose();

		// Wait for callback to be triggered by the update
		await vi.waitFor(
			async () => {
				// First callback should not be triggered again after update
				expect(firstCallbackInvocations.length).toBe(1);
				// Second callback should be triggered after update
				expect(secondCallbackInvocations.length).toBe(1);
			},
			{ timeout: 10_000, interval: 100 }
		);

		// Verify if the remote worker is no longer in the registry
		await vi.waitFor(
			async () => {
				const latestInvocation = secondCallbackInvocations.at(-1);
				// Registry should not contain remote-worker
				expect(latestInvocation?.registry["remote-worker"]).toBeUndefined();
			},
			{ timeout: 10_000, interval: 100 }
		);
	});
});
