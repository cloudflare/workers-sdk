import path from "node:path";
import test from "ava";
import { Miniflare } from "miniflare";
import { useTmp } from "./test-shared";

test.skip("DevRegistry: fetch to module worker", async (t) => {
	const tmp = await useTmp(t);
	const unsafeDevRegistryPath = path.join(tmp, "dev-registry");
	const remote = new Miniflare({
		name: "worker-a",
		unsafeDevRegistryPath,
		compatibilityFlags: ["experimental"],
		modules: true,
		script: `
			export default {
				async fetch(request, env, ctx) {
                    const url = new URL(request.url);
                    const name = url.searchParams.get("name");

                    if (!name) {
                        return new Response("Missing name", { status: 400 });
                    }

					return new Response("Hello " + name);
				}
			}
		`,
		unsafeDirectSockets: [
			{
				proxy: true,
			},
		],
	});
	t.teardown(() => remote.dispose());

	await remote.ready;

	const local = new Miniflare({
		name: "worker-b",
		unsafeDevRegistryPath,
		serviceBindings: {
			SERVICE: {
				name: "worker-a",
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

	const res = await local.dispatchFetch("http://placeholder?name=World");
	const result = await res.text();
	t.is(res.status, 200);
	t.is(result, "Hello World");
});
test("DevRegistry: RPC to default entrypoint", async (t) => {
	const tmp = await useTmp(t);
	const unsafeDevRegistryPath = path.join(tmp, "dev-registry");
	const remote = new Miniflare({
		name: "worker-a",
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
				proxy: true,
			},
		],
	});
	t.teardown(() => remote.dispose());

	await remote.ready;

	const local = new Miniflare({
		name: "worker-b",
		unsafeDevRegistryPath,
		serviceBindings: {
			SERVICE: {
				name: "worker-a",
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
		name: "worker-a",
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
	t.teardown(() => remote.dispose());

	await remote.ready;

	const local = new Miniflare({
		name: "worker-b",
		unsafeDevRegistryPath,
		serviceBindings: {
			SERVICE: {
				name: "worker-a",
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
test.skip("DevRegistry: fetch to unknown worker", async (t) => {
	const tmp = await useTmp(t);
	const unsafeDevRegistryPath = path.join(tmp, "dev-registry");
	const mf = new Miniflare({
		name: "worker-a",
		unsafeDevRegistryPath,
		serviceBindings: {
			SERVICE: {
				name: "worker-b",
			},
		},
		compatibilityFlags: ["experimental"],
		modules: true,
		script: `
			export default {
				async fetch(request, env, ctx) {
                    try {
                        return await env.SERVICE.fetch(request);
                    } catch (e) {
                        return new Response(e.message, { status: 500 });
                    }
				}
			}
		`,
	});
	t.teardown(() => mf.dispose());

	const res = await mf.dispatchFetch("http://placeholder");
	const result = await res.text();
	t.is(res.status, 500);
	t.is(result, "???");
});
test("DevRegistry: RPC to unknown worker", async (t) => {
	const tmp = await useTmp(t);
	const unsafeDevRegistryPath = path.join(tmp, "dev-registry");
	const mf = new Miniflare({
		name: "worker-a",
		unsafeDevRegistryPath,
		serviceBindings: {
			SERVICE: {
				name: "worker-b",
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
		`Cannot access "ping" as we couldn\'t find a dev session for the "default" entrypoint of service "worker-b" to proxy to.`
	);
});
test("DevRegistry: RPC to unknown entrypoint", async (t) => {
	const tmp = await useTmp(t);
	const unsafeDevRegistryPath = path.join(tmp, "dev-registry");
	const remote = new Miniflare({
		name: "worker-a",
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
				proxy: true,
			},
		],
	});
	t.teardown(() => remote.dispose());

	await remote.ready;

	const local = new Miniflare({
		name: "worker-b",
		unsafeDevRegistryPath,
		serviceBindings: {
			SERVICE: {
				name: "worker-a",
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
		`Cannot access "ping" as we couldn\'t find a dev session for the "TestEntrypoint" entrypoint of service "worker-a" to proxy to.`
	);
});
test.skip("DevRegistry: fetch to service worker", async (t) => {
	const tmp = await useTmp(t);
	const unsafeDevRegistryPath = path.join(tmp, "dev-registry");
	const remote = new Miniflare({
		name: "worker-a",
		unsafeDevRegistryPath,
		compatibilityFlags: ["experimental"],
		script: `addEventListener("fetch", (event) => {
			event.respondWith(new Response("Hello from service worker!"));
		})`,
	});
	t.teardown(() => remote.dispose());

	await remote.ready;

	const local = new Miniflare({
		name: "worker-b",
		unsafeDevRegistryPath,
		serviceBindings: {
			SERVICE: {
				name: "worker-a",
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
