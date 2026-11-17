import { Miniflare } from "miniflare";
import { test } from "vitest";
import { singleModuleManifest, useDispose } from "../../test-shared";
import type { MiniflareOptions } from "miniflare";

// https://github.com/cloudflare/workers-sdk/issues/16986
//
// The local Artifacts binding is a wrapped binding that runs in the caller's
// isolate. A Durable Object that calls it must still be evictable once the
// call has settled, and once it has disposed what it was given.
const SCRIPT = `
import { DurableObject } from "cloudflare:workers";

export class Caller extends DurableObject {
  async fetch(request) {
    const action = new URL(request.url).pathname.slice(1);
    if (action === "none") {
      return Response.json({ ok: true });
    }
    if (action === "list-disposed") {
      const result = await this.env.REPOS.list();
      result[Symbol.dispose]?.();
      return Response.json({ total: result.total });
    }
    if (action === "list") {
      const result = await this.env.REPOS.list();
      return Response.json({ total: result.total });
    }
    if (action === "get-missing") {
      try {
        const repo = await this.env.REPOS.get("missing");
        repo[Symbol.dispose]();
        return Response.json({ code: null });
      } catch (error) {
        return Response.json({ code: error.code });
      }
    }
    if (action === "get-info-disposed") {
      const repo = await this.env.REPOS.get("demo");
      try {
        const info = await repo.info();
        return Response.json({ name: info.name });
      } finally {
        repo[Symbol.dispose]();
      }
    }
    return new Response("Unknown action", { status: 404 });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/create") {
      const created = await env.REPOS.create("demo");
      return Response.json({ name: created.name });
    }
    const name = url.searchParams.get("name");
    return env.CALLER.get(env.CALLER.idFromName(name)).fetch(
      "http://caller" + url.pathname
    );
  }
};
`;

function options(): MiniflareOptions {
	return {
		cf: false,
		workers: [
			{
				config: {
					name: "caller",
					compatibilityDate: "2026-09-03",
					manifest: singleModuleManifest(SCRIPT),
					env: {
						REPOS: {
							type: "artifacts",
							namespace: "eviction",
							dev: { remote: false },
						},
						CALLER: {
							type: "durable-object",
							worker: "caller",
							exportName: "Caller",
						},
					},
					exports: {
						Caller: { type: "durable-object", storage: "sqlite" },
					},
				},
			},
		],
	};
}

// workerd gives up on an eviction after about 30 seconds, rejecting with
// "Timed out waiting to evict Durable Object: it still has active references."
const TEST_TIMEOUT = 60_000;

function evict(mf: Miniflare, name: string): Promise<void> {
	return mf.unsafeEvictDurableObject("caller", "Caller", { name });
}

test(
	"evicts a Durable Object that did not call Artifacts",
	async ({ expect }) => {
		const mf = new Miniflare(options());
		useDispose(mf);

		const response = await mf.dispatchFetch("http://localhost/none?name=a");
		expect(await response.json()).toEqual({ ok: true });

		await expect(evict(mf, "a")).resolves.toBeUndefined();
	},
	TEST_TIMEOUT
);

test(
	"evicts a Durable Object that called Artifacts list() and disposed the result",
	async ({ expect }) => {
		const mf = new Miniflare(options());
		useDispose(mf);

		const response = await mf.dispatchFetch(
			"http://localhost/list-disposed?name=b"
		);
		expect(await response.json()).toEqual({ total: 0 });

		await expect(evict(mf, "b")).resolves.toBeUndefined();
	},
	TEST_TIMEOUT
);

test(
	"evicts a Durable Object that called Artifacts list()",
	async ({ expect }) => {
		const mf = new Miniflare(options());
		useDispose(mf);

		const response = await mf.dispatchFetch("http://localhost/list?name=c");
		expect(await response.json()).toEqual({ total: 0 });

		await expect(evict(mf, "c")).resolves.toBeUndefined();
	},
	TEST_TIMEOUT
);

test(
	"evicts a Durable Object whose Artifacts get() failed",
	async ({ expect }) => {
		const mf = new Miniflare(options());
		useDispose(mf);

		const response = await mf.dispatchFetch(
			"http://localhost/get-missing?name=d"
		);
		expect(await response.json()).toEqual({ code: "NOT_FOUND" });

		await expect(evict(mf, "d")).resolves.toBeUndefined();
	},
	TEST_TIMEOUT
);

test(
	"evicts a Durable Object that read a repository's info() and disposed the repository",
	async ({ expect }) => {
		const mf = new Miniflare(options());
		useDispose(mf);

		// Create the repository outside the Durable Object, so only the calls
		// the Durable Object makes itself can hold it.
		let response = await mf.dispatchFetch("http://localhost/create");
		expect(await response.json()).toEqual({ name: "demo" });

		response = await mf.dispatchFetch(
			"http://localhost/get-info-disposed?name=e"
		);
		expect(await response.json()).toEqual({ name: "demo" });

		await expect(evict(mf, "e")).resolves.toBeUndefined();
	},
	TEST_TIMEOUT
);
