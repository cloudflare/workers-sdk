import path from "node:path";
import test from "ava";
import { Miniflare } from "miniflare";
import { useTmp } from "./test-shared";

test("DevRegistry: fetch to service worker", async (t) => {
	const tmp = await useTmp(t);
	const unsafeDevRegistryPath = path.join(tmp, "dev-registry");
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
	const result = await res.text();
	t.is(res.status, 200);
	t.is(result, "Hello from service worker!");
});
test("DevRegistry: fetch to module worker", async (t) => {
	const tmp = await useTmp(t);
	const unsafeDevRegistryPath = path.join(tmp, "dev-registry");
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
	const result = await res.text();
	t.is(result, "Hello World");
	t.is(res.status, 200);
});
test("DevRegistry: RPC to default entrypoint", async (t) => {
	const tmp = await useTmp(t);
	const unsafeDevRegistryPath = path.join(tmp, "dev-registry");
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
					const result = await env.SERVICE.ping();
					return new Response(result);
				}
			}
		`,
	});
	t.teardown(() => local.dispose());

	const res = await local.dispatchFetch("http://placeholder");
	const result = await res.text();
	t.is(result, "pong");
});
test("DevRegistry: RPC to custom entrypoint", async (t) => {
	const tmp = await useTmp(t);
	const unsafeDevRegistryPath = path.join(tmp, "dev-registry");
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
	t.teardown(() => remote.dispose());

	await remote.ready;

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
					const result = await env.SERVICE.ping();
					return new Response(result);
				}
			}
		`,
	});
	t.teardown(() => local.dispose());

	const res = await local.dispatchFetch("http://placeholder");
	const result = await res.text();
	t.is(result, "pong");
});
test("DevRegistry: fetch to unknown worker", async (t) => {
	const tmp = await useTmp(t);
	const unsafeDevRegistryPath = path.join(tmp, "dev-registry");
	const mf = new Miniflare({
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
	t.teardown(() => mf.dispose());

	const res = await mf.dispatchFetch("http://placeholder");
	const result = await res.text();
	t.is(res.status, 503);
	t.is(
		result,
		`Couldn\'t find a local dev session for the "default" entrypoint of service "remote-worker" to proxy to`
	);
});
test("DevRegistry: RPC to unknown worker", async (t) => {
	const tmp = await useTmp(t);
	const unsafeDevRegistryPath = path.join(tmp, "dev-registry");
	const mf = new Miniflare({
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
	t.teardown(() => mf.dispose());

	const res = await mf.dispatchFetch("http://placeholder");
	t.is(res.status, 500);
	t.is(
		await res.text(),
		`Cannot access "ping" as we couldn\'t find a local dev session for the "default" entrypoint of service "remote-worker" to proxy to.`
	);
});
test("DevRegistry: RPC to unknown entrypoint", async (t) => {
	const tmp = await useTmp(t);
	const unsafeDevRegistryPath = path.join(tmp, "dev-registry");
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

	await remote.ready;

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
	t.is(res.status, 500);
	t.is(
		await res.text(),
		`Cannot access "ping" as we couldn\'t find a local dev session for the "TestEntrypoint" entrypoint of service "remote-worker" to proxy to.`
	);
});
test("DevRegistry: fetch to unknown durable object", async (t) => {
	const tmp = await useTmp(t);
	const unsafeDevRegistryPath = path.join(tmp, "dev-registry");
	const mf = new Miniflare({
		name: "local-worker",
		unsafeDevRegistryPath,
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
test("DevRegistry: fetch to unknown worker with dev registry disabled", async (t) => {
	const mf = new Miniflare({
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
	});
	t.teardown(() => mf.dispose());

	const res = await mf.dispatchFetch("http://placeholder");
	const result = await res.text();
	t.is(
		result,
		`Worker Entrypoint "default" of service "remote-worker" is not defined in the options. ` +
			`Set the "unsafeDevRegistryPath" option if you would like Miniflare to lookup services from the Dev Registry.`
	);
	t.is(res.status, 503);
});
test("DevRegistry: RPC to unknown worker with dev registry disabled", async (t) => {
	const mf = new Miniflare({
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
                        return new Response(result);
                    } catch (e) {
                        return new Response(e.message, { status: 500 });
                    }
				}
			}
		`,
	});
	t.teardown(() => mf.dispose());

	const res = await mf.dispatchFetch("http://placeholder");
	t.is(res.status, 500);
	t.is(
		await res.text(),
		`Worker Entrypoint "default" of service "remote-worker" is not defined in the options. ` +
			`Set the "unsafeDevRegistryPath" option if you would like Miniflare to lookup services from the Dev Registry.`
	);
});
test("DevRegistry: fetch to unknown durable object with dev registry disabled", async (t) => {
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
test("DevRegistry: RPC to unknown durable object with dev registry disabled", async (t) => {
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
			`Set the "unsafeDevRegistryPath" option if you would like Miniflare to lookup services from the Dev Registry.`
	);
	t.is(res.status, 500);
});
test("DevRegistry: fetch to durable object", async (t) => {
	const tmp = await useTmp(t);
	const unsafeDevRegistryPath = path.join(tmp, "dev-registry");
	const remote = new Miniflare({
		name: "remote-worker",
		unsafeDevRegistryPath,
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
	t.is(result, "Hello from Durable Object!");
	t.is(res.status, 200);
});
test("DevRegistry: RPC to durable object", async (t) => {
	const tmp = await useTmp(t);
	const unsafeDevRegistryPath = path.join(tmp, "dev-registry");
	const remote = new Miniflare({
		name: "remote-worker",
		unsafeDevRegistryPath,
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
		`Cannot access "ping" as Durable Object RPC is not yet supported between multiple dev sessions.`
	);
	t.is(res.status, 500);
});
