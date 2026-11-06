import { newWebSocketRpcSession, RpcTarget } from "capnweb";
import { Miniflare } from "miniflare";
import { test } from "vitest";
import { singleModuleManifest, TestLog } from "../../test-shared";
import { useRemoteProxyServer } from "../hyperdrive/helpers";
import type { MiniflareOptions } from "miniflare";

// Stand-in for the AI Search binding the remote-bindings proxy server exposes
// (see `ProxyServerWorker` in `@cloudflare/remote-bindings`): top-level
// namespace methods, `.get()` returning an RPC-capable instance, and nested
// `items`/`jobs` namespaces on both the instance and the namespace itself.
// Mirrors the binding shape reported in
// https://github.com/cloudflare/workers-sdk/issues/15644.
class AiSearchInstance extends RpcTarget {
	constructor(private readonly instanceId: string) {
		super();
	}

	async info() {
		return { id: this.instanceId };
	}

	async search(query: string) {
		return { chunks: [query] };
	}

	get items() {
		const instanceId = this.instanceId;
		return {
			async list() {
				return { result: [`${instanceId}-chunk`] };
			},
			async upload(data: string) {
				return { uploaded: data };
			},
			async delete(id: string) {
				return { deleted: id };
			},
		};
	}
}

const aiSearchBinding = {
	async stats() {
		return { completed: 1, queued: 0 };
	},
	async list() {
		return { result: [] };
	},
	async create(options: unknown) {
		return { id: "instance-1" };
	},
	async delete(id: string) {
		return { deleted: id };
	},
	get(id: string) {
		return new AiSearchInstance(id);
	},
	get items() {
		return {
			async list() {
				return { result: ["namespace-chunk"] };
			},
			async upload(data: string) {
				return { uploaded: data };
			},
			async delete(id: string) {
				return { deleted: id };
			},
		};
	},
	get jobs() {
		return {
			async create(options: unknown) {
				return { id: "job-1" };
			},
			async list() {
				return { result: [] };
			},
		};
	},
};

const script = `
export default {
  async fetch(request, env) {
    const out = {};
    const run = async (name, fn) => {
      try { out[name] = await fn(); } catch (e) { out[name] = e.name + ": " + e.message; }
    };
    // Top-level namespace methods
    await run("stats()", async () => typeof (await env.AI_SEARCH.stats()).completed);
    await run("list()", async () => (await env.AI_SEARCH.list()).result.length);
    await run("delete()", async () => (await env.AI_SEARCH.delete("i1")).deleted);
    // Instance returned by a method call
    await run("get().info()", async () => (await env.AI_SEARCH.get("i1").info()).id);
    await run("get().search()", async () => (await env.AI_SEARCH.get("i1").search("hello")).chunks[0]);
    await run("get().items.list()", async () => (await env.AI_SEARCH.get("i1").items.list()).result.length);
    // Nested namespaces on the binding itself
    await run("items.list()", async () => (await env.AI_SEARCH.items.list()).result.length);
    await run("items.upload()", async () => (await env.AI_SEARCH.items.upload("hello")).uploaded);
    await run("items.delete()", async () => (await env.AI_SEARCH.items.delete("c1")).deleted);
    await run("jobs.list()", async () => (await env.AI_SEARCH.jobs.list()).result.length);
    await run("jobs.create()", async () => (await env.AI_SEARCH.jobs.create({})).id);
    return Response.json(out);
  }
};
`;

test("remote AI Search binding exposes nested `items`/`jobs` namespaces over RPC", async ({
	expect,
}) => {
	const { edge, url } = await useRemoteProxyServer();
	edge.on("connection", (websocket) => {
		newWebSocketRpcSession(websocket as unknown as WebSocket, aiSearchBinding);
	});

	const options: MiniflareOptions = {
		log: new TestLog(),
		workers: [
			{
				config: {
					name: "main",
					compatibilityDate: "2026-09-01",
					manifest: singleModuleManifest(script),
					env: {
						AI_SEARCH: {
							type: "ai-search",
							name: "instance",
							dev: { remote: true },
						},
					},
				},
				dev: { remoteProxyConnectionString: url },
			},
		],
	};
	const mf = new Miniflare(options);
	try {
		const response = await mf.dispatchFetch("http://localhost/");
		// The Worker reports each operation's result, or its error message so
		// failures show exactly what the binding call threw.
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			// Top-level namespace methods
			"stats()": "number",
			"list()": 0,
			"delete()": "i1",
			// Instance returned by a method call
			"get().info()": "i1",
			"get().search()": "hello",
			"get().items.list()": 1,
			// Nested namespaces on the binding itself
			"items.list()": 1,
			"items.upload()": "hello",
			"items.delete()": "c1",
			"jobs.list()": 0,
			"jobs.create()": "job-1",
		});
	} finally {
		await mf.dispose();
	}
});
