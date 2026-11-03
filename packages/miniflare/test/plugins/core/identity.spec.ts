import { createPublicKey, verify } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Miniflare, Response, convertV4MiniflareOptions } from "miniflare";
import { test, vi } from "vitest";
import { singleModuleManifest, useDispose, useTmp } from "../../test-shared";
import type { JsonWebKey } from "node:crypto";

for (const legacy of [false, true]) {
	test(`source-built local issuance and discovery (${legacy ? "legacy" : "config"})`, async ({
		expect,
	}) => {
		const identity = {
			audience: "urn:local-receiver",
			authorization_grants: {
				allowed_authorization_servers: ["https://as.identity.local"],
				allowed_scopes: ["read"],
			},
			request_signing: {
				allowed_origins: ["https://api.identity.local"],
				allowed_methods: ["GET"],
			},
		};
		const script = `export default { async fetch(request, env) {
      using a = await env.IDENTITY.getIdentity("agent-a"), b = await env.IDENTITY.getIdentity("agent-b");
      const token = await a.getToken(), other = await b.getToken(), fresh = await a.getToken();
      const grant = await a.getAuthorizationGrant({authorizationServer:"https://as.identity.local",scope:["read"]});
      const claims = JSON.parse(atob(token.split(".")[1].replaceAll("-","+").replaceAll("_","/")));
      const discovery = await (await fetch(claims.iss + "/.well-known/openid-configuration")).json();
      const jwks = await (await fetch(discovery.jwks_uri)).json();
      const wagKeys = await (await fetch(claims.iss + "/.well-known/wag-jwks.json")).json();
      const signed = await (await a.fetch("https://api.identity.local/signed")).json();
      return Response.json({token,other,fresh,grant,jwks,wagKeys,id:await a.id,signed});
    }};`;
		const mf = new Miniflare(
			legacy
				? convertV4MiniflareOptions({
						modules: true,
						script,
						compatibilityDate: "2026-10-30",
						identities: { IDENTITY: identity },
					})
				: {
						workers: [
							{
								config: {
									name: "local-agents",
									compatibilityDate: "2026-10-30",
									env: { IDENTITY: { type: "identity", ...identity } },
									manifest: singleModuleManifest(script),
								},
							},
						],
					}
		);
		useDispose(mf);
		const data = (await (
			await mf.dispatchFetch("http://localhost/")
		).json()) as {
			token: string;
			other: string;
			fresh: string;
			grant: string;
			jwks: { keys: JsonWebKey[] };
			wagKeys: { keys: JsonWebKey[] };
			id: string;
			signed: { status: string; identity: { signatureAgent: string } };
		};
		const decode = (jwt: string) =>
			JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString());
		const validate = (jwt: string, keys: JsonWebKey[]) => {
			const [header, body, signature] = jwt.split(".");
			expect(
				verify(
					"RSA-SHA256",
					Buffer.from(`${header}.${body}`),
					createPublicKey({ key: keys[0], format: "jwk" }),
					Buffer.from(signature, "base64url")
				)
			).toBe(true);
		};
		validate(data.token, data.jwks.keys);
		validate(data.grant, data.wagKeys.keys);
		const actor = decode(data.token),
			other = decode(data.other),
			grant = decode(data.grant);
		expect(actor.sub).toMatch(/^agent:[a-z2-7]{52}$/);
		expect(actor.sub).not.toBe(other.sub);
		expect(actor.iss).toMatch(
			/^https:\/\/[a-f0-9]{32}\.identity\.local\/accounts\/[a-f0-9]{32}$/
		);
		expect(actor.parent_sub).toMatch(/^worker:/);
		expect(actor.execution).toBe("local");
		expect(grant.execution).toBe("local");
		expect(grant.sub).toBe(actor.sub);
		expect(actor.sub).toBe(`agent:${data.id}`);
		expect(data.signed.status).toBe("verified");
		expect(new URL(data.signed.identity.signatureAgent).hostname).toMatch(
			new RegExp(`^${data.id}\\.`)
		);
		expect(decode(data.fresh).jti).not.toBe(actor.jti);
		expect(data.jwks.keys).not.toEqual(data.wagKeys.keys);
	});
}

test("persists an isolated authority and starts a new realm after reset", async ({
	expect,
}) => {
	const directory = await useTmp();
	const options = {
		resourcePersistencePath: directory,
		workers: [
			{
				config: {
					name: "persistent",
					compatibilityDate: "2026-10-30",
					env: {
						IDENTITY: { type: "identity" as const, audience: "urn:local" },
					},
					manifest: singleModuleManifest(
						`export default {async fetch(r,env){return new Response(await env.IDENTITY.getToken())}}`
					),
				},
			},
		],
	};
	const first = new Miniflare(options);
	const a = await (await first.dispatchFetch("http://localhost/")).text();
	await first.dispose();
	const second = new Miniflare(options);
	useDispose(second);
	const b = await (await second.dispatchFetch("http://localhost/")).text();
	const decode = (jwt: string) =>
		JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString());
	expect(decode(a).iss).toBe(decode(b).iss);
	const keys = JSON.parse(
		await readFile(path.join(directory, "identity", "authority.json"), "utf8")
	);
	expect(keys.version).toBe(1);
	const third = new Miniflare({
		...options,
		resourcePersistencePath: await useTmp(),
	});
	useDispose(third);
	expect(
		decode(await (await third.dispatchFetch("http://localhost/")).text()).iss
	).not.toBe(decode(a).iss);
});

for (const selection of ["app", "customer"] as const) {
	for (const authentication of [
		"none",
		"private_key_jwt",
		"client_secret_basic",
	] as const) {
		test(`normal local consent, inspection, DPoP and disconnect (${selection}, ${authentication})`, async ({
			expect,
		}) => {
			const scope = ["read"],
				resources = [
					{ origin: "https://api.identity.local", methods: ["GET" as const] },
				],
				inspection_resources = [
					{
						url: "https://api.identity.local/profile",
						methods: ["GET" as const],
					},
				],
				return_urls = ["http://127.0.0.1:8787/complete"];
			const identity = {
				type: "identity" as const,
				selection,
				connection_management: true,
				scope,
				resources,
				inspection_resources,
				return_urls,
				oauth: {
					grant: "authorization_code" as const,
					authorization_server: "https://as.identity.local",
					resource: "https://api.identity.local",
					discovery: true,
					permission_ceiling: {
						scope,
						resources,
						inspection_resources,
						return_urls,
					},
					client_registration: { mode: "dynamic" as const, authentication },
				},
			};
			const prefix = selection === "customer" ? '"customer-a",' : "";
			const selector =
				selection === "customer"
					? '{customerId:"customer-a",agentId:"agent-a"}'
					: '"agent-a"';
			const script = `export default {async fetch(request,env){
        const path=new URL(request.url).pathname;
        if(path==="/start") return Response.json(await env.ISSUES.beginConnection(${prefix}{sessionId:"application-session-12345678901234567890",returnTo:"http://127.0.0.1:8787/complete"}));
        if(path==="/finish") {
          const result=await request.json();
          const input={...result,sessionId:"application-session-12345678901234567890"};
          const metadata=await env.ISSUES.previewConnection(${prefix}input);
          using pending=await env.ISSUES.getPendingIdentity(${prefix}input);
          const inspection=await (await pending.fetch("https://api.identity.local/profile")).json();
          const completed=await env.ISSUES.completeConnection(${prefix}input);
          return Response.json({metadata,inspection,completed});
        }
        if(path==="/disconnect") return Response.json(await env.ISSUES.disconnectAll(${selection === "customer" ? '"customer-a"' : ""}));
        using selected=await env.ISSUES.getIdentity(${selector});
        const status=await selected.getStatus();
        return Response.json({status,...(status.state==="ready"?{data:await(await selected.fetch("https://api.identity.local/items")).json()}:{}),connectionId:await selected.connectionId});
      }}`;
			const mf = new Miniflare({
				workers: [
					{
						config: {
							name: "local-connections",
							compatibilityDate: "2026-10-30",
							env: { ISSUES: identity },
							manifest: singleModuleManifest(script),
						},
					},
				],
			});
			useDispose(mf);
			const start = (await (
				await mf.dispatchFetch("http://localhost/start")
			).json()) as { authorizationUrl: string; flowId: string };
			expect(start.authorizationUrl).toContain(
				"/cdn-cgi/local/identity/authorize?"
			);
			const authorization = await mf.dispatchFetch(start.authorizationUrl, {
				redirect: "manual",
			});
			await authorization.body?.cancel();
			expect(authorization.status).toBe(303);
			const callback = authorization.headers.get("location");
			if (!callback) throw new Error("Missing fixture callback");
			const callbackResponse = await mf.dispatchFetch(callback, {
				redirect: "manual",
			});
			await callbackResponse.body?.cancel();
			expect(callbackResponse.status).toBe(303);
			const returned = callbackResponse.headers.get("location");
			if (!returned) throw new Error("Missing application callback");
			const receipt = Object.fromEntries(
				new URLSearchParams(new URL(returned).hash.slice(1))
			);
			const finish = (await (
				await mf.dispatchFetch("http://localhost/finish", {
					method: "POST",
					body: JSON.stringify(receipt),
				})
			).json()) as {
				completed: { status: string };
				inspection: { workspace: { key: string } };
			};
			expect(finish.completed.status).toBe("ready");
			expect(finish.inspection.workspace.key).toBe("standards-fixture");
			const result = (await (
				await mf.dispatchFetch("http://localhost/data")
			).json()) as {
				status: { state: string };
				data: { records: unknown[] };
				connectionId: string;
			};
			expect(result.status.state).toBe("ready");
			expect(result.data.records).toHaveLength(1);
			expect(result.connectionId).toMatch(/^[a-f0-9-]{36}$/);
			const disconnected = (await (
				await mf.dispatchFetch("http://localhost/disconnect")
			).json()) as { providerCleanup: string };
			expect(disconnected.providerCleanup).toBe("complete");
			expect(
				await (await mf.dispatchFetch("http://localhost/data")).json()
			).toMatchObject({ status: { state: "default_required" } });
		});
	}
}

// This contract needs the companion runtime until its published release lands.
// No local polyfill may turn decoding or a mocked claim into verified identity.
test.skipIf(!process.env.MINIFLARE_WORKERD_PATH)(
	"runtime caller needs no binding and rejects malformed credentials locally",
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
		).toEqual({ name: "WorkloadIdentityError" });
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

test.skipIf(!process.env.MINIFLARE_WORKERD_PATH)(
	"native local receiver verifies selected JWTs without a receiver binding",
	async ({ expect }) => {
		const mf = new Miniflare({
			workers: [
				{
					config: {
						name: "local-receiver",
						compatibilityDate: "2026-10-30",
						compatibilityFlags: ["enable_workload_identity_context"],
						env: {
							IDENTITY: { type: "identity", audience: "urn:local-receiver" },
						},
						manifest:
							singleModuleManifest(`export default {async fetch(r,env,ctx){
  if(new URL(r.url).pathname==="/token") return new Response(await (await env.IDENTITY.getIdentity("immutable-agent")).getToken());
  try{return Response.json(await ctx.identity.caller())}catch(e){return Response.json({error:e.name})}
 }}`),
					},
				},
			],
		});
		useDispose(mf);
		const token = await (
			await mf.dispatchFetch("http://localhost/token")
		).text();
		const claims = JSON.parse(
			Buffer.from(token.split(".")[1], "base64url").toString()
		);
		const result = await (
			await mf.dispatchFetch("http://localhost/", {
				headers: { authorization: `Bearer ${token}` },
			})
		).json();
		expect(result).toMatchObject({
			kind: "jwt",
			subject: claims.sub,
			issuer: claims.iss,
			audience: "urn:local-receiver",
			originVersionId: claims.version_id,
		});
		const pieces = token.split(".");
		const signature = Buffer.from(pieces[2], "base64url");
		signature[0] ^= 1;
		pieces[2] = signature.toString("base64url");
		expect(
			await (
				await mf.dispatchFetch("http://localhost/", {
					headers: { authorization: `Bearer ${pieces.join(".")}` },
				})
			).json()
		).toEqual({ error: "WorkloadIdentityError" });
	}
);
