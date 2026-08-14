import { Miniflare, type WorkerOptions } from "miniflare";
import { describe, test } from "vitest";
import { singleModuleManifest, useDispose } from "../../test-shared";

// Cloudflare Access local dev wiring.
//
// When `dev.access` is configured, Miniflare:
// 1. Sets `accessBlobHeader` on the user worker so workerd reads a header to
//    populate `ctx.access`.
// 2. Injects that header from the entry worker on every incoming request.
// 3. Creates an embedded access identity binding worker and sets
//    `accessBindingService` on the user worker so `ctx.access.getIdentity()`
//    dispatches to it via JS-RPC.

function plainWorker(script: string): WorkerOptions {
	return {
		config: {
			type: "worker",
			name: "user",
			compatibilityDate: "2026-06-01",
			manifest: singleModuleManifest(script),
		},
	};
}

describe("access (wiring)", () => {
	test("worker with access config boots and serves", async ({ expect }) => {
		const mf = new Miniflare({
			workers: [
				{
					...plainWorker(
						`export default { async fetch() { return new Response("ok"); } }`
					),
					dev: {
						access: { aud: "test-aud" },
					},
				},
			],
		});
		useDispose(mf);

		// A broken injection (bad service reference or missing compat flags)
		// would fail to start workerd or to serve.
		const res = await mf.dispatchFetch("http://localhost/");
		expect(await res.text()).toBe("ok");
	});

	test("ctx.access.aud is populated from config", async ({ expect }) => {
		const mf = new Miniflare({
			workers: [
				{
					...plainWorker(`
						export default {
							async fetch(request, env, ctx) {
								return Response.json({
									aud: ctx.access?.aud ?? null,
								});
							}
						}
					`),
					dev: {
						access: { aud: "my-test-audience" },
					},
				},
			],
		});
		useDispose(mf);

		const res = await mf.dispatchFetch("http://localhost/");
		const body = await res.json();
		expect(body).toEqual({ aud: "my-test-audience" });
	});

	test("ctx.access.getIdentity() returns configured identity", async ({
		expect,
	}) => {
		const mf = new Miniflare({
			workers: [
				{
					...plainWorker(`
						export default {
							async fetch(request, env, ctx) {
								const identity = await ctx.access?.getIdentity();
								return Response.json({ identity: identity ?? null });
							}
						}
					`),
					dev: {
						access: {
							aud: "my-test-audience",
							identity: { email: "user@example.com", sub: "user-123" },
						},
					},
				},
			],
		});
		useDispose(mf);

		const res = await mf.dispatchFetch("http://localhost/");
		const body = await res.json();
		expect(body).toEqual({
			identity: { email: "user@example.com", sub: "user-123" },
		});
	});

	test("ctx.access is undefined when access config is absent", async ({
		expect,
	}) => {
		const mf = new Miniflare({
			workers: [
				plainWorker(`
					export default {
						async fetch(request, env, ctx) {
							return Response.json({ hasAccess: ctx.access !== undefined });
						}
					}
				`),
			],
		});
		useDispose(mf);

		const res = await mf.dispatchFetch("http://localhost/");
		const body = await res.json();
		expect(body).toEqual({ hasAccess: false });
	});

	test("ctx.access.getIdentity() returns undefined when no identity configured", async ({
		expect,
	}) => {
		const mf = new Miniflare({
			workers: [
				{
					...plainWorker(`
						export default {
							async fetch(request, env, ctx) {
								return Response.json({
									hasAccess: ctx.access !== undefined,
									identity: (await ctx.access?.getIdentity()) ?? null,
								});
							}
						}
					`),
					dev: {
						access: { aud: "my-test-audience" },
					},
				},
			],
		});
		useDispose(mf);

		const res = await mf.dispatchFetch("http://localhost/");
		const body = await res.json();
		// ctx.access should still be present even without identity configured
		expect(body).toEqual({ hasAccess: true, identity: null });
	});
});
