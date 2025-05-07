import path from "node:path";
import test from "ava";
import { Miniflare } from "miniflare";
import { useTmp } from "./test-shared";

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
		unsafeDirectSockets: [
			{
				proxy: true,
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
		unsafeDirectSockets: [
			{
				proxy: true,
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
				proxy: true,
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
		`Couldn\'t find dev session for the "default" entrypoint of service "remote-worker" to proxy to`
	);
});
test("DevRegistry: RPC to unknown worker", async (t) => {
	const tmp = await useTmp(t);
	const unsafeDevRegistryPath = path.join(tmp, "dev-registry");
	const mf = new Miniflare({
		name: "remote-worker",
		unsafeDevRegistryPath,
		serviceBindings: {
			SERVICE: {
				name: "local-worker",
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
		`Cannot access "ping" as we couldn\'t find a dev session for the "default" entrypoint of service "local-worker" to proxy to.`
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
		unsafeDirectSockets: [
			{
				proxy: true,
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
		`Cannot access "ping" as we couldn\'t find a dev session for the "TestEntrypoint" entrypoint of service "remote-worker" to proxy to.`
	);
});
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
