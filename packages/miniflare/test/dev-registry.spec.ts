import test from "ava";
import { Miniflare, MiniflareOptions, WorkerRegistry } from "miniflare";
import { useTmp, waitUntil } from "./test-shared";

test("DevRegistry: fetch to service worker", async (t) => {
	const unsafeDevRegistryPath = await useTmp(t);
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
	t.teardown(() => local.dispose());

	const res = await local.dispatchFetch("http://placeholder");

	t.is(await res.text(), "Hello from service worker!");
	t.is(res.status, 200);

	// Kill the remote worker to see if it fails gracefully
	await remote.dispose();
	await waitUntil(t, async (t) => {
		const res = await local.dispatchFetch("http://placeholder");

		t.is(
			await res.text(),
			`Couldn\'t find a local dev session for the "default" entrypoint of service "remote-worker" to proxy to`
		);
		t.is(res.status, 503);
	});
});

test("DevRegistry: fetch to module worker", async (t) => {
	const unsafeDevRegistryPath = await useTmp(t);
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
	t.teardown(() => local.dispose());

	const res = await local.dispatchFetch("http://example.com?name=World");
	t.is(
		await res.text(),
		`Response from remote worker: Couldn\'t find a local dev session for the "default" entrypoint of service "remote-worker" to proxy to`
	);
	t.is(res.status, 503);

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
	t.teardown(() => remote.dispose());

	await remote.ready;
	await waitUntil(t, async (t) => {
		const res = await local.dispatchFetch("http://example.com?name=World");
		const result = await res.text();
		t.is(result, "Response from remote worker: Hello World");
		t.is(res.status, 200);
	});
});

test("DevRegistry: WebSocket upgrade to module worker", async (t) => {
	const unsafeDevRegistryPath = await useTmp(t);
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
	t.teardown(() => local.dispose());

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
	t.teardown(() => remote.dispose());

	await remote.ready;
	await waitUntil(t, async (t) => {
		const res = await local.dispatchFetch("http://example.com");
		const result = await res.text();
		t.is(result, "WebSocket communication successful: pong");
		t.is(res.status, 200);
	});
});

test("DevRegistry: RPC to default entrypoint", async (t) => {
	const unsafeDevRegistryPath = await useTmp(t);
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
	t.teardown(() => local.dispose());

	const res = await local.dispatchFetch("http://placeholder");
	t.is(
		await res.text(),
		`Cannot access "ping" as we couldn\'t find a local dev session for the "default" entrypoint of service "remote-worker" to proxy to.`
	);
	t.is(res.status, 500);

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
	await waitUntil(t, async (t) => {
		const res = await local.dispatchFetch("http://placeholder");
		const result = await res.text();
		t.is(result, "Response from remote worker: pong");
	});

	// Kill the remote worker to see if it fails gracefully
	await remote.dispose();
	await waitUntil(t, async (t) => {
		const res = await local.dispatchFetch("http://placeholder");
		t.is(
			await res.text(),
			`Cannot access "ping" as we couldn\'t find a local dev session for the "default" entrypoint of service "remote-worker" to proxy to.`
		);
		t.is(res.status, 500);
	});
});

test("DevRegistry: RPC to custom entrypoint", async (t) => {
	const unsafeDevRegistryPath = await useTmp(t);
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
	t.teardown(() => local.dispose());

	const res = await local.dispatchFetch("http://placeholder");
	t.is(
		await res.text(),
		`Cannot access "ping" as we couldn\'t find a local dev session for the "TestEntrypoint" entrypoint of service "remote-worker" to proxy to.`
	);
	t.is(res.status, 500);

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
	await waitUntil(t, async (t) => {
		const res = await local.dispatchFetch("http://placeholder");
		const result = await res.text();
		t.is(result, "Response from remote worker: pong");
	});

	await remote.dispose();
	await waitUntil(t, async (t) => {
		const res = await local.dispatchFetch("http://placeholder");
		t.is(
			await res.text(),
			`Cannot access "ping" as we couldn\'t find a local dev session for the "TestEntrypoint" entrypoint of service "remote-worker" to proxy to.`
		);
		t.is(res.status, 500);
	});
});

test("DevRegistry: fetch to module worker with node bindings", async (t) => {
	const unsafeDevRegistryPath = await useTmp(t);
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
	t.teardown(() => local.dispose());

	const bindings = await local.getBindings<Record<string, any>>();

	await waitUntil(t, async (t) => {
		const res = await bindings.SERVICE.fetch("http://example.com?name=World");
		t.is(
			await res.text(),
			`Couldn\'t find a local dev session for the "default" entrypoint of service "remote-worker" to proxy to`
		);
		t.is(res.status, 503);
	});

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
	await waitUntil(t, async (t) => {
		const res = await bindings.SERVICE.fetch("http://example.com?name=World");
		const result = await res.text();
		t.is(result, "Hello World");
		t.is(res.status, 200);
	});

	await remote.dispose();
	await waitUntil(t, async (t) => {
		const res = await bindings.SERVICE.fetch("http://example.com?name=World");
		t.is(
			await res.text(),
			`Couldn\'t find a local dev session for the "default" entrypoint of service "remote-worker" to proxy to`
		);
		t.is(res.status, 503);
	});
});

test("DevRegistry: RPC to default entrypoint with node bindings", async (t) => {
	const unsafeDevRegistryPath = await useTmp(t);
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
	t.teardown(() => local.dispose());

	const env = await local.getBindings<Record<string, any>>();

	await waitUntil(t, async (t) => {
		try {
			const result = await env.SERVICE.ping();
			t.fail(`Expected error, got result: ${result}`);
		} catch (e) {
			t.is(
				e instanceof Error ? e.message : `${e}`,
				`Cannot access "ping" as we couldn\'t find a local dev session for the "default" entrypoint of service "remote-worker" to proxy to.`
			);
		}
	});

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
	await waitUntil(t, async (t) => {
		const result = await env.SERVICE.ping();
		t.is(result, "pong");
	});

	// Kill the remote worker to see if it fails gracefully
	await remote.dispose();
	await waitUntil(t, async (t) => {
		try {
			const result = await env.SERVICE.ping();
			t.fail(`Expected error, got result: ${result}`);
		} catch (e) {
			t.is(
				e instanceof Error ? e.message : `${e}`,
				`Cannot access "ping" as we couldn\'t find a local dev session for the "default" entrypoint of service "remote-worker" to proxy to.`
			);
		}
	});
});

test("DevRegistry: fetch to durable object with do proxy disabled", async (t) => {
	const unsafeDevRegistryPath = await useTmp(t);
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
	t.teardown(() => remote.dispose());

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
	t.teardown(() => local.dispose());

	const res = await local.dispatchFetch("http://placeholder");
	const result = await res.text();
	t.is(result, "Service Unavailable");
	t.is(res.status, 503);
});

test("DevRegistry: RPC to durable object with do proxy disabled", async (t) => {
	const unsafeDevRegistryPath = await useTmp(t);
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
	t.teardown(() => remote.dispose());

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
	t.teardown(() => local.dispose());

	const res = await local.dispatchFetch("http://placeholder");
	const result = await res.text();
	t.is(
		result,
		`Couldn't find the durable Object "MyDurableObject" of script "remote-worker".`
	);
	t.is(res.status, 500);
});

test("DevRegistry: fetch to durable object", async (t) => {
	const unsafeDevRegistryPath = await useTmp(t);
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
	t.teardown(() => local.dispose());

	const res = await local.dispatchFetch("http://placeholder");
	t.is(await res.text(), "Service Unavailable");
	t.is(res.status, 503);

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
	t.teardown(() => remote.dispose());

	await remote.ready;
	await waitUntil(t, async (t) => {
		const res = await local.dispatchFetch("http://placeholder");
		t.is(await res.text(), "Hello from Durable Object!");
		t.is(res.status, 200);
	});
});

test("DevRegistry: RPC to durable object", async (t) => {
	const unsafeDevRegistryPath = await useTmp(t);
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
	t.teardown(() => local.dispose());

	const res = await local.dispatchFetch("http://placeholder");
	t.is(
		await res.text(),
		`Cannot access "MyDurableObject#ping" as Durable Object RPC is not yet supported between multiple dev sessions.`
	);
	t.is(res.status, 500);

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
	t.teardown(() => remote.dispose());

	await remote.ready;
	await waitUntil(t, async (t) => {
		const res = await local.dispatchFetch("http://placeholder");
		t.is(
			await res.text(),
			`Cannot access "MyDurableObject#ping" as Durable Object RPC is not yet supported between multiple dev sessions.`
		);
		t.is(res.status, 500);
	});
});

test("DevRegistry: tail to default entrypoint", async (t) => {
	const unsafeDevRegistryPath = await useTmp(t);
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
	t.teardown(() => remote.dispose());

	await remote.ready;

	const local = new Miniflare({
		name: "local-worker",
		unsafeDevRegistryPath,
		tails: ["remote-worker"],
		serviceBindings: {
			remote: "remote-worker",
		},
		compatibilityFlags: ["experimental"],
		modules: true,
		script: `
			export default {
				async fetch(request, env) {
					if (request.url.includes("remote-worker")) {
						return env.remote.fetch(request)
					}
					console.log("log event")
					return new Response("Hello from local-worker!");
				}
			}
		`,
	});
	t.teardown(() => local.dispose());

	const res = await local.dispatchFetch("http://example.com");
	const result = await res.text();
	t.is(result, "Hello from local-worker!");

	const res2 = await local.dispatchFetch("http://example.com/remote-worker");
	const result2 = await res2.json();

	t.deepEqual(result2, ["log event"]);
});

test("DevRegistry: tail to unknown worker", async (t) => {
	const unsafeDevRegistryPath = await useTmp(t);
	const mf = new Miniflare({
		name: "local-worker",
		unsafeDevRegistryPath,
		tails: ["remote-worker"],
		serviceBindings: {
			remote: "remote-worker",
		},
		compatibilityFlags: ["experimental"],
		modules: true,
		script: `
			export default {
				async fetch(request, env) {
					if (request.url.includes("remote-worker")) {
						return env.remote.fetch(request)
					}
					console.log("log event")
					return new Response("Hello from local-worker!");
				}
			}
		`,
	});
	t.teardown(() => mf.dispose());

	const res = await mf.dispatchFetch("http://example.com");
	const result = await res.text();
	t.is(result, "Hello from local-worker!");

	const res2 = await mf.dispatchFetch("http://example.com/remote-worker");
	const result2 = await res2.text();

	t.deepEqual(
		result2,
		`Couldn\'t find a local dev session for the "default" entrypoint of service "remote-worker" to proxy to`
	);
});

test("DevRegistry: miniflare with different registry path", async (t) => {
	const unsafeDevRegistryPath = await useTmp(t);
	const unsafeDevRegistryPath2 = await useTmp(t);
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
	t.teardown(() => local.dispose());

	const res = await local.dispatchFetch("http://placeholder");
	t.is(
		await res.text(),
		`Cannot access "ping" as we couldn\'t find a local dev session for the "default" entrypoint of service "remote-worker" to proxy to.`
	);
	t.is(res.status, 500);

	const remote = new Miniflare({
		...remoteOptions,
		unsafeDevRegistryPath,
	});
	t.teardown(() => remote.dispose());

	await remote.ready;
	await waitUntil(t, async (t) => {
		const res = await local.dispatchFetch("http://placeholder");
		const result = await res.text();
		t.is(result, "Response from remote worker: pong");
	});

	// Change remote's registry path to a different value
	await remote.setOptions({
		...remoteOptions,
		unsafeDevRegistryPath: unsafeDevRegistryPath2,
	});
	await waitUntil(t, async (t) => {
		const res = await local.dispatchFetch("http://placeholder");
		t.is(
			await res.text(),
			`Cannot access "ping" as we couldn\'t find a local dev session for the "default" entrypoint of service "remote-worker" to proxy to.`
		);
		t.is(res.status, 500);
	});

	// Change local's registry path to the same path as remote's
	await local.setOptions({
		...localOptions,
		unsafeDevRegistryPath: unsafeDevRegistryPath2,
	});
	await waitUntil(t, async (t) => {
		const res = await local.dispatchFetch("http://placeholder");
		const result = await res.text();
		t.is(result, "Response from remote worker: pong");
	});
});

test("DevRegistry: fetch to module worker with https enabled", async (t) => {
	const unsafeDevRegistryPath = await useTmp(t);
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
	t.teardown(() => local.dispose());

	const res = await local.dispatchFetch("https://example.com?name=World");

	t.is(
		await res.text(),
		`Response from remote worker: Couldn\'t find a local dev session for the "default" entrypoint of service "remote-worker" to proxy to`
	);
	t.is(res.status, 503);

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
	t.teardown(() => remote.dispose());

	await remote.ready;
	await waitUntil(t, async (t) => {
		const res = await local.dispatchFetch("https://example.com?name=World");
		const result = await res.text();
		t.is(result, "Response from remote worker: Hello World");
		t.is(res.status, 200);
	});
});

test("DevRegistry: fetch to durable object with https enabled", async (t) => {
	const unsafeDevRegistryPath = await useTmp(t);
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
	t.teardown(() => local.dispose());

	const res = await local.dispatchFetch("http://placeholder");
	t.is(await res.text(), "Service Unavailable");
	t.is(res.status, 503);

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
	t.teardown(() => remote.dispose());

	await remote.ready;
	await waitUntil(t, async (t) => {
		const res = await local.dispatchFetch("http://placeholder");
		t.is(await res.text(), "Hello from Durable Object!");
		t.is(res.status, 200);
	});
});

test("DevRegistry: handleDevRegistryUpdate callback", async (t) => {
	const unsafeDevRegistryPath = await useTmp(t);
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
	t.teardown(() => local.dispose());

	// Callback should not be triggered initially since no external services exist
	t.is(firstCallbackInvocations.length, 0);
	t.is(secondCallbackInvocations.length, 0);

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
	t.teardown(() => unrelated.dispose());

	await unrelated.ready;

	// Callback should not be triggered since we're not bound to unrelated-worker
	t.is(firstCallbackInvocations.length, 0);
	t.is(secondCallbackInvocations.length, 0);

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
	t.teardown(async () => {
		try {
			await remote.dispose();
		} catch {
			// Ignore if already disposed
		}
	});

	await remote.ready;

	// Wait for the callback to be triggered
	await waitUntil(t, async (t) => {
		t.true(
			firstCallbackInvocations.length >= 1,
			"Callback should be triggered when bound Worker starts"
		);
		t.true(
			secondCallbackInvocations.length === 0,
			"Second callback should not be triggered yet"
		);
	});

	// Verify the callback was called with the correct registry data
	await waitUntil(t, async (t) => {
		const latestInvocation = firstCallbackInvocations.at(-1);

		t.true(
			latestInvocation && "remote-worker" in latestInvocation.registry,
			"Registry should contain remote-worker"
		);
	});

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
	await waitUntil(t, async (t) => {
		t.true(
			firstCallbackInvocations.length === 1,
			"First callback should not be triggered again after update"
		);
		t.true(
			secondCallbackInvocations.length === 1,
			"Second callback should be triggered after update"
		);
	});

	// Verify if the remote worker is no longer in the registry
	await waitUntil(t, async (t) => {
		const latestInvocation = secondCallbackInvocations.at(-1);

		t.false(
			!latestInvocation || "remote-worker" in latestInvocation.registry,
			"Registry should not contain remote-worker"
		);
	});
});
