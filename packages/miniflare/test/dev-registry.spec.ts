import test from "ava";
import { Miniflare, MiniflareOptions } from "miniflare";
import { useTmp, waitUntil } from "./test-shared";

test("DevRegistry: fetch to service worker", async (t) => {
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
					return await env.SERVICE.fetch(request);
				}
			}
		`,
	});
	t.teardown(() => local.dispose());

	const res = await local.dispatchFetch("http://placeholder");

	t.is(
		await res.text(),
		`Couldn\'t find a local dev session for the "default" entrypoint of service "remote-worker" to proxy to`
	);
	t.is(res.status, 503);

	const remote = new Miniflare({
		name: "remote-worker",
		unsafeDevRegistryPath,
		compatibilityFlags: ["experimental"],
		script: `addEventListener("fetch", (event) => {
			event.respondWith(new Response("Hello from service worker!"));
		})`,
	});
	t.teardown(() => remote.dispose());

	await remote.ready;
	await waitUntil(t, async (t) => {
		const res = await local.dispatchFetch("http://placeholder");

		t.is(await res.text(), "Hello from service worker!");
		t.is(res.status, 200);
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
					return await env.SERVICE.fetch(request);
				}
			}
		`,
	});
	t.teardown(() => local.dispose());

	const res = await local.dispatchFetch("http://example.com?name=World");
	t.is(
		await res.text(),
		`Couldn\'t find a local dev session for the "default" entrypoint of service "remote-worker" to proxy to`
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
                    const url = new URL(request.url, 'http://placeholder');
                    const name = url.searchParams.get("name") ?? 'anonymous';

					return new Response("Hello " + name);
				}
			}
		`,
		unsafeDirectSockets: [{}],
	});
	t.teardown(() => remote.dispose());

	await remote.ready;
	await waitUntil(t, async (t) => {
		const res = await local.dispatchFetch("http://example.com?name=World");
		const result = await res.text();
		t.is(result, "Hello World");
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
                        return new Response(result);
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
		unsafeDirectSockets: [{}],
	});

	await remote.ready;
	await waitUntil(t, async (t) => {
		const res = await local.dispatchFetch("http://placeholder");
		const result = await res.text();
		t.is(result, "pong");
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
                        return new Response(result);
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
			},
		],
	});

	await remote.ready;
	await waitUntil(t, async (t) => {
		const res = await local.dispatchFetch("http://placeholder");
		const result = await res.text();
		t.is(result, "pong");
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

test("DevRegistry: fetch to external worker with dev registry disabled", async (t) => {
	const unsafeDevRegistryPath = await useTmp(t);
	const remote = new Miniflare({
		name: "remote-worker",
		unsafeDevRegistryPath,
		compatibilityFlags: ["experimental"],
		modules: true,
		script: `
			export default {
				async fetch(request, env, ctx) {
                    const url = new URL(request.url, 'http://placeholder');
                    const name = url.searchParams.get("name") ?? 'anonymous';

					return new Response("Hello " + name);
				}
			}
		`,
		unsafeDirectSockets: [{}],
	});
	t.teardown(() => remote.dispose());

	// To make sure the remote worker is registered
	await remote.ready;

	const localWorkerOptions: MiniflareOptions = {
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
                    return await env.SERVICE.fetch(request);
				}
			}
		`,
	};
	const local = new Miniflare(localWorkerOptions);
	t.teardown(() => local.dispose());

	const res = await local.dispatchFetch("http://placeholder");
	const result = await res.text();
	t.is(
		result,
		`Worker Entrypoint "default" of service "remote-worker" is not defined in the options. ` +
			`Set the "unsafeDevRegistryPath" option if you would like Miniflare to lookup services from the Dev Registry.`
	);
	t.is(res.status, 503);

	// Enable the dev registry
	await local.setOptions({
		...localWorkerOptions,
		unsafeDevRegistryPath,
	});
	await waitUntil(t, async (t) => {
		const res = await local.dispatchFetch("http://placeholder");
		t.is(await res.text(), "Hello anonymous");
		t.is(res.status, 200);
	});
});

test("DevRegistry: RPC to external worker with dev registry disabled", async (t) => {
	const unsafeDevRegistryPath = await useTmp(t);
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
		unsafeDirectSockets: [{}],
	});
	t.teardown(() => remote.dispose());

	// To make sure the remote worker is registered
	await remote.ready;

	const localWorkerOptions: MiniflareOptions = {
		name: "local-worker",
		// The dev registry path is commented out
		// unsafeDevRegistryPath,
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
                        return new Response(result);
                    } catch (e) {
                        return new Response(e.message, { status: 500 });
                    }
				}
			}
		`,
	};

	const local = new Miniflare(localWorkerOptions);
	t.teardown(() => local.dispose());

	const res = await local.dispatchFetch("http://placeholder");
	t.is(
		await res.text(),
		`Worker Entrypoint "default" of service "remote-worker" is not defined in the options. ` +
			`Set the "unsafeDevRegistryPath" option if you would like Miniflare to lookup services from the Dev Registry.`
	);
	t.is(res.status, 500);

	// Enable the dev registry
	await local.setOptions({
		...localWorkerOptions,
		unsafeDevRegistryPath,
	});
	await waitUntil(t, async (t) => {
		const res = await local.dispatchFetch("http://placeholder");
		const result = await res.text();
		t.is(result, "pong");
	});
});

test("DevRegistry: fetch to external durable object with dev registry disabled", async (t) => {
	const mf = new Miniflare({
		name: "local-worker",
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
	t.teardown(() => mf.dispose());

	const res = await mf.dispatchFetch("http://placeholder");
	const result = await res.text();
	t.is(res.status, 503);
	t.is(result, "Service Unavailable");
});

test("DevRegistry: RPC to external durable object with dev registry disabled", async (t) => {
	const mf = new Miniflare({
		name: "local-worker",
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
	t.teardown(() => mf.dispose());

	const res = await mf.dispatchFetch("http://placeholder");
	const result = await res.text();
	t.is(
		result,
		`Durable Object "MyDurableObject" of script "remote-worker" is not defined in the options. ` +
			`Set the "unsafeDevRegistryDOProxy" option if you would like Miniflare to lookup services from the Dev Registry.`
	);
	t.is(res.status, 500);
});

test("DevRegistry: fetch to durable object with do proxy disabled", async (t) => {
	const unsafeDevRegistryPath = await useTmp(t);
	const remote = new Miniflare({
		name: "remote-worker",
		unsafeDevRegistryPath,
		unsafeDevRegistryDoProxy: false,
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
		unsafeDevRegistryDoProxy: false,
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
		unsafeDevRegistryDoProxy: false,
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
		unsafeDevRegistryDoProxy: false,
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
		`Durable Object "MyDurableObject" of script "remote-worker" is not defined in the options. ` +
			`Set the "unsafeDevRegistryDOProxy" option if you would like Miniflare to lookup services from the Dev Registry.`
	);
	t.is(res.status, 500);
});

test("DevRegistry: fetch to durable object", async (t) => {
	const unsafeDevRegistryPath = await useTmp(t);
	const local = new Miniflare({
		name: "local-worker",
		unsafeDevRegistryPath,
		unsafeDevRegistryDoProxy: true,
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
	t.is(await res.text(), "Service Unavailable");
	t.is(res.status, 503);

	const remote = new Miniflare({
		name: "remote-worker",
		unsafeDevRegistryPath,
		unsafeDevRegistryDoProxy: true,
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
		unsafeDevRegistryDoProxy: true,
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
	t.is(
		await res.text(),
		`Cannot access "ping" as Durable Object RPC is not yet supported between multiple dev sessions.`
	);
	t.is(res.status, 500);

	const remote = new Miniflare({
		name: "remote-worker",
		unsafeDevRegistryPath,
		unsafeDevRegistryDoProxy: true,
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
			`Cannot access "ping" as Durable Object RPC is not yet supported between multiple dev sessions.`
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
		unsafeDirectSockets: [{}],
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
