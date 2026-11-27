import { Miniflare, type WorkerOptions } from "miniflare";
import { describe, test } from "vitest";
import { singleModuleManifest, useDispose } from "../../test-shared";

// Cloudflare Access local dev wiring.
//
// When `config.access.dev` is configured, Miniflare:
// 1. Sets `accessBlobHeader` on the user worker so workerd reads a header to
//    populate `ctx.access`.
// 2. Injects that header from the entry worker on every incoming request.
// 3. Creates an embedded access identity binding worker and sets
//    `accessBindingService` on the user worker so `ctx.access.getIdentity()`
//    dispatches to it via JS-RPC.

type AccessConfig = NonNullable<WorkerOptions["config"]["access"]>;

interface PlainWorkerOptions {
	name?: string;
	route?: string;
	access?: AccessConfig;
}

function plainWorker(
	script: string,
	options: PlainWorkerOptions = {}
): WorkerOptions {
	return {
		config: {
			name: options.name ?? "user",
			compatibilityDate: "2026-06-01",
			manifest: singleModuleManifest(script),
			triggers:
				options.route === undefined
					? undefined
					: [{ type: "fetch", pattern: options.route }],
			access: options.access,
		},
	};
}

describe("access (wiring)", () => {
	test("worker with access config boots and serves", async ({ expect }) => {
		const mf = new Miniflare({
			workers: [
				plainWorker(
					`export default { async fetch() { return new Response("ok"); } }`,
					{ access: { dev: { aud: "test-aud" } } }
				),
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
				plainWorker(
					`
						export default {
							async fetch(request, env, ctx) {
								return Response.json({
									aud: ctx.access?.aud ?? null,
								});
							}
						}
					`,
					{ access: { dev: { aud: "my-test-audience" } } }
				),
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
				plainWorker(
					`
						export default {
							async fetch(request, env, ctx) {
								const identity = await ctx.access?.getIdentity();
								return Response.json({ identity: identity ?? null });
							}
						}
					`,
					{
						access: {
							dev: {
								aud: "my-test-audience",
								identity: { email: "user@example.com", sub: "user-123" },
							},
						},
					}
				),
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
				plainWorker(
					`
						export default {
							async fetch(request, env, ctx) {
								return Response.json({
									hasAccess: ctx.access !== undefined,
									identity: (await ctx.access?.getIdentity()) ?? null,
								});
							}
						}
					`,
					{ access: { dev: { aud: "my-test-audience" } } }
				),
			],
		});
		useDispose(mf);

		const res = await mf.dispatchFetch("http://localhost/");
		const body = await res.json();
		// ctx.access should still be present even without identity configured
		expect(body).toEqual({ hasAccess: true, identity: null });
	});

	test("uses the Access configuration for the routed Worker", async ({
		expect,
	}) => {
		const script = `
			export default {
				async fetch(request, env, ctx) {
					return Response.json({
						aud: ctx.access?.aud,
						identity: await ctx.access?.getIdentity(),
					});
				}
			}
		`;
		const mf = new Miniflare({
			workers: [
				plainWorker(script, {
					name: "worker-a",
					route: "*/a",
					access: {
						dev: {
							aud: "aud-a",
							identity: { email: "a@example.com" },
						},
					},
				}),
				plainWorker(script, {
					name: "worker-b",
					route: "*/b",
					access: {
						dev: {
							aud: "aud-b",
							identity: { email: "b@example.com" },
						},
					},
				}),
			],
		});
		useDispose(mf);

		const responseA = await mf.dispatchFetch("http://localhost/a");
		expect(await responseA.json()).toEqual({
			aud: "aud-a",
			identity: { email: "a@example.com" },
		});

		const responseB = await mf.dispatchFetch("http://localhost/b");
		expect(await responseB.json()).toEqual({
			aud: "aud-b",
			identity: { email: "b@example.com" },
		});
	});
});
