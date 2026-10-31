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
	test(`identity calls fail without outbound requests (${legacy ? "legacy" : "config"})`, async ({
		expect,
	}) => {
		const outbound = vi.fn(() => new Response("unexpected outbound request"));
		const identity = { audience: "urn:inventory" };
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
	"explicit test verifier uses the native API and isolates concurrent callers",
	async ({ expect }) => {
		const mf = new Miniflare({
			workers: [
				{
					config: {
						name: "receiver",
						compatibilityDate: "2026-10-31",
						manifest:
							singleModuleManifest(`export default { async fetch(request, env, ctx) {
              const first = ctx.identity.caller();
              const samePromise = first === ctx.identity.caller();
              const caller = await first;
              return Response.json({caller, samePromise, frozen:Object.isFrozen(caller), body:await request.text()});
            }};`),
					},
					dev: {
						unsafeWorkloadIdentityService: {
							type: "worker",
							worker: "explicit-test-verifier",
							exportName: "MockVerifier",
							props: { testOnly: true },
						},
					},
				},
				{
					config: {
						name: "explicit-test-verifier",
						compatibilityDate: "2026-10-31",
						manifest:
							singleModuleManifest(`import {WorkerEntrypoint} from "cloudflare:workers";
              // This fake service tests plumbing, never cryptographic verification.
              export class MockVerifier extends WorkerEntrypoint {
                async verify(request) {
                  if (this.ctx.props.testOnly !== true) throw Error("Missing test marker");
                  await request.text();
                  return {status:"verified",identity:{kind:"signed-request",id:request.headers.get("authorization")}};
                }
              }`),
					},
				},
			],
		});
		useDispose(mf);
		const results = await Promise.all(
			["a", "b"].map(async (id) =>
				(
					await mf.dispatchFetch("http://localhost/", {
						method: "POST",
						body: id,
						headers: { authorization: `Bearer ${id}`, signature: "test-only" },
					})
				).json()
			)
		);
		expect(results).toEqual(
			["a", "b"].map((id) => ({
				caller: { kind: "signed-request", id: `Bearer ${id}` },
				samePromise: true,
				frozen: true,
				body: id,
			}))
		);
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
