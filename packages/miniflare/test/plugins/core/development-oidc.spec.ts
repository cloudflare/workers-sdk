import {
	Miniflare,
	type DevelopmentOidcBrokerFactory,
	type WorkerOptions,
} from "miniflare";
import { describe, test, vi } from "vitest";
import { singleModuleManifest, useDispose } from "../../test-shared";

const token = "eyJhbGciOiJSUzI1NiJ9.eyJleGVjdXRpb24iOiJsb2NhbCJ9.c2ln";

function worker(developmentOidc?: DevelopmentOidcBrokerFactory): WorkerOptions {
	return {
		config: {
			name: "linked",
			compatibilityDate: "2026-01-01",
			compatibilityFlags: ["workers_oidc"],
			manifest: singleModuleManifest(`
   export default { async fetch(request, env, ctx) {
    try {
     if (new URL(request.url).pathname === "/env") return Response.json(Object.keys(env));
     const audience = new URL(request.url).searchParams.get("audience");
     return new Response(await ctx.oidc.getToken(audience === null ? undefined : {audience}));
    } catch (error) { return new Response(error.message, {status: 500}); }
   } };
  `),
		},
		dev: { developmentOidc },
	};
}

// The native callback has not reached the pinned npm runtime yet. CI enables
// this suite when testing the matching workerd build through its standard override.
describe.skipIf(!process.env.MINIFLARE_WORKERD_PATH)(
	"native development OIDC broker",
	() => {
		test("shares development identity with local DOs and isolates service/RPC target Workers", async ({
			expect,
		}) => {
			const otherToken = "e30.eyJ3b3JrZXIiOiJvdGhlciJ9.c2ln";
			const getToken = vi.fn(async () => token),
				otherGetToken = vi.fn(async () => otherToken);
			const mf = new Miniflare({
				workers: [
					{
						config: {
							name: "first",
							compatibilityDate: "2026-01-01",
							compatibilityFlags: ["workers_oidc"],
							manifest: singleModuleManifest(`
     import { DurableObject } from "cloudflare:workers";
     export class LocalObject extends DurableObject {
      async token() {return this.ctx.oidc.getToken();}
      async explicit() {return this.ctx.oidc.getToken({subject: "object"});}
     }
     export default {async fetch(request, env, ctx) {
      const one = env.OBJECTS.getByName("one"), two = env.OBJECTS.getByName("two");
      let explicitRejected = false;
      try {await one.explicit();} catch {explicitRejected = true;}
      return Response.json({worker: await ctx.oidc.getToken(), one: await one.token(), two: await two.token(), target: await env.OTHER.token(), explicitRejected});
     }};
    `),
							env: {
								OBJECTS: {
									type: "durable-object",
									worker: "first",
									exportName: "LocalObject",
								},
								OTHER: {
									type: "worker",
									worker: "second",
									exportName: "Issuer",
								},
							},
							exports: {
								LocalObject: { type: "durable-object", storage: "sqlite" },
							},
						},
						dev: {
							developmentOidc: {
								key: "first",
								create: () => ({ getToken, dispose() {} }),
							},
						},
					},
					{
						config: {
							name: "second",
							compatibilityDate: "2026-01-01",
							compatibilityFlags: ["workers_oidc"],
							manifest: singleModuleManifest(`
    import {WorkerEntrypoint} from "cloudflare:workers";
    export class Issuer extends WorkerEntrypoint {async token() {return this.ctx.oidc.getToken();}}
    export default {fetch() {return new Response("second");}};
   `),
						},
						dev: {
							developmentOidc: {
								key: "second",
								create: () => ({ getToken: otherGetToken, dispose() {} }),
							},
						},
					},
				],
			});
			useDispose(mf);
			expect(
				await (await mf.dispatchFetch("http://localhost/")).json()
			).toEqual({
				worker: token,
				one: token,
				two: token,
				target: otherToken,
				explicitRejected: true,
			});
			expect(getToken).toHaveBeenCalledTimes(3);
			expect(otherGetToken).toHaveBeenCalledOnce();
		});

		test("routes default/explicit audiences without exposing a binding; retains reloads and disposes changes", async ({
			expect,
		}) => {
			const getToken = vi.fn(async () => token),
				dispose = vi.fn();
			const create = vi.fn(() => ({ getToken, dispose }));
			const factory = { key: "linked", create };
			const mf = new Miniflare({ workers: [worker(factory)] });
			useDispose(mf);
			await mf.ready;
			expect(create).not.toHaveBeenCalled();
			expect(await (await mf.dispatchFetch("http://localhost/")).text()).toBe(
				token
			);
			expect(getToken).toHaveBeenLastCalledWith({});
			expect(
				await (
					await mf.dispatchFetch("http://localhost/?audience=exact%22%E9%9B%AA")
				).text()
			).toBe(token);
			expect(getToken).toHaveBeenLastCalledWith({ audience: 'exact"雪' });
			expect(
				await (await mf.dispatchFetch("http://localhost/env")).json()
			).toEqual([]);
			await mf.setOptions({ workers: [worker({ ...factory })] });
			expect(await (await mf.dispatchFetch("http://localhost/")).text()).toBe(
				token
			);
			expect(create).toHaveBeenCalledOnce();
			expect(dispose).not.toHaveBeenCalled();
			await mf.setOptions({
				workers: [worker({ ...factory, key: "another" })],
			});
			expect(dispose).toHaveBeenCalledOnce();
			expect(await (await mf.dispatchFetch("http://localhost/")).text()).toBe(
				token
			);
			await mf.dispose();
			expect(dispose).toHaveBeenCalledTimes(2);
		});
		test("rejects absent brokers and suppresses host exception secrets", async ({
			expect,
		}) => {
			const mf = new Miniflare({
				workers: [
					worker({
						key: "errors",
						create: () => ({
							getToken: async () => {
								throw new Error("bearer-secret");
							},
							dispose() {},
						}),
					}),
				],
			});
			useDispose(mf);
			const response = await mf.dispatchFetch("http://localhost/");
			expect(response.status).toBe(500);
			expect(await response.text()).not.toContain("bearer-secret");
			await mf.setOptions({ workers: [worker()] });
			const unavailable = await mf.dispatchFetch("http://localhost/");
			expect(unavailable.status).toBe(500);
			await unavailable.text();
		});
	}
);
