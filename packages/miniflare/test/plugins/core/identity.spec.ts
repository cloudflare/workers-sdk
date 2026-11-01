import { Miniflare, Response, convertV4MiniflareOptions } from "miniflare";
import { test, vi } from "vitest";
import { singleModuleManifest, useDispose } from "../../test-shared";

const script = `export default {
  async fetch(request, env) {
    const errors = [];
    for (const call of [
      () => env.IDENTITY.getToken(),
      () => env.IDENTITY.getIdentity(),
      () => env.IDENTITY.getIdentity("customer_x"),
      () => env.IDENTITY.getAuthorizationGrant({authorizationServer: "https://auth.example"}),
      () => env.IDENTITY.fetch("https://api.example", { method: "POST", body: "private" }),

    ]) {
      try { await call(); errors.push("unexpected success"); }
      catch (error) { errors.push(error.message); }
    }
    return Response.json(errors);
  }
};`;

for (const legacy of [false, true]) {
	for (const exchange of [
		"workload_authorization",
		"client_credentials",
	] as const) {
		test(`identity calls fail without outbound requests (${legacy ? "legacy" : "config"}, ${exchange})`, async ({
			expect,
		}) => {
			const outbound = vi.fn(() => new Response("unexpected outbound request"));
			const identity = {
				client_authentication: true,
				oauth: {
					...(exchange === "client_credentials"
						? {
								exchange: "client_credentials" as const,
								client_id: "provider-id",
							}
						: { exchange: "workload_authorization" as const }),
					authorization_server: "https://auth.example",
					token_endpoint: "https://auth.example/token",
					resource: "https://api.example",
					scope: ["read"],
					allowed_origins: ["https://api.example"],
					allowed_methods: ["GET"],
					dpop: "preferred" as const,
				},
			};
			const mf = new Miniflare(
				legacy
					? convertV4MiniflareOptions({
							modules: true,
							script,
							compatibilityDate: "2026-01-01",
							identities: { IDENTITY: identity },
							outboundService: outbound,
						})
					: {
							workers: [
								{
									config: {
										name: "test",
										compatibilityDate: "2026-01-01",
										env: { IDENTITY: { type: "identity", ...identity } },
										manifest: singleModuleManifest(script),
									},
									dev: {
										outboundService: { type: "fetcher", handler: outbound },
									},
								},
							],
						}
			);
			useDispose(mf);
			const response = await mf.dispatchFetch("http://localhost/");
			const errors = (await response.json()) as string[];
			expect(errors).toHaveLength(5);
			expect(errors[4]).toContain("Use getIdentity().fetch()");
			for (const error of errors) {
				expect(error).toContain(
					"Identity issuance is unavailable in local development"
				);
				expect(error).toContain("deployed Preview");
			}
			expect(outbound).not.toHaveBeenCalled();
		});
	}
}

// This contract needs the companion runtime until its published release lands.
// No local polyfill may turn decoding or a mocked claim into verified identity.
test.skipIf(!process.env.MINIFLARE_WORKERD_PATH)(
	"runtime caller needs no binding and distinguishes missing from unavailable",
	async ({ expect }) => {
		const outbound = vi.fn(() => new Response("unexpected outbound request"));
		const mf = new Miniflare({
			workers: [
				{
					config: {
						name: "receiver",
						compatibilityDate: "2026-10-31",
						compatibilityFlags: ["enable_workload_identity_context"],
						manifest:
							singleModuleManifest(`export default { async fetch(request, env, ctx) {
				try { const caller = await ctx.identity.caller(); return Response.json({caller}); }
				catch (error) { return Response.json({name:error.name}); }
			}}`),
					},
					dev: { outboundService: { type: "fetcher", handler: outbound } },
				},
			],
		});
		useDispose(mf);
		expect(await (await mf.dispatchFetch("http://localhost/")).json()).toEqual({
			caller: null,
		});
		expect(
			await (
				await mf.dispatchFetch("http://localhost/", {
					headers: { authorization: "Bearer credential" },
				})
			).json()
		).toEqual({ name: "WorkloadIdentityUnavailableError" });
		expect(outbound).not.toHaveBeenCalled();
	}
);

test.skipIf(!process.env.MINIFLARE_WORKERD_PATH)(
	"ordinary service bindings expose local immediate callers through fetch and RPC",
	async ({ expect }) => {
		const mf = new Miniflare({
			workers: [
				{
					config: {
						name: "a",
						compatibilityDate: "2026-10-31",
						compatibilityFlags: ["enable_workload_identity_context"],
						manifest:
							singleModuleManifest(`export default {async fetch(request,env,ctx){
        const own=await ctx.identity.caller();
        const rpc=await env.B.who();
        const http=await (await env.B.fetch("http://b/",{method:"POST",body:"body",headers:{authorization:"Bearer forged"}})).json();
        const hop=await env.B.hop();
        return Response.json({own,rpc,http,hop});
      }}`),
						env: { B: { type: "worker", worker: "b", exportName: "Receiver" } },
					},
				},
				{
					config: {
						name: "b",
						compatibilityDate: "2026-10-31",
						compatibilityFlags: ["enable_workload_identity_context"],
						manifest:
							singleModuleManifest(`import {WorkerEntrypoint} from "cloudflare:workers";
        export class Receiver extends WorkerEntrypoint {
          async who(){const p=this.ctx.identity.caller();if(p!==this.ctx.identity.caller())throw Error("not memoized");return p;}
          async fetch(request){await request.text();return Response.json(await this.who());}
          hop(){return this.env.C.who();}
        }`),
						env: { C: { type: "worker", worker: "c", exportName: "Receiver" } },
					},
				},
				{
					config: {
						name: "c",
						compatibilityDate: "2026-10-31",
						compatibilityFlags: ["enable_workload_identity_context"],
						manifest:
							singleModuleManifest(`import {WorkerEntrypoint} from "cloudflare:workers";
        export class Receiver extends WorkerEntrypoint {who(){return this.ctx.identity.caller();}}`),
					},
				},
			],
		});
		useDispose(mf);
		const result = (await (
			await mf.dispatchFetch("http://localhost/")
		).json()) as {
			own: unknown;
			rpc: { kind: string; accountId: string; workerId: string };
			http: unknown;
			hop: { kind: string; accountId: string; workerId: string };
		};
		expect(result.own).toBeNull();
		expect(result.rpc).toEqual(result.http);
		expect(result.rpc).toMatchObject({
			kind: "service-binding",
			accountId: "local",
		});
		expect(result.rpc.workerId).toMatch(/^local:.*a$/);
		expect(result.hop).toMatchObject({
			kind: "service-binding",
			accountId: "local",
		});
		expect(result.hop.workerId).toMatch(/^local:.*b$/);
		expect(result.hop.workerId).not.toBe(result.rpc.workerId);
	}
);
