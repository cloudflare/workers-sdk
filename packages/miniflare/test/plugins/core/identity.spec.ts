import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { removeDir } from "@cloudflare/workers-utils";
import { Miniflare, Response, convertV4MiniflareOptions } from "miniflare";
import { test, vi } from "vitest";
import { singleModuleManifest, useDispose } from "../../test-shared";

for (const legacy of [false, true]) {
	test(`issues and verifies actual local JWTs without a cloud request (${legacy ? "legacy" : "config"})`, async ({
		expect,
	}) => {
		const outbound = vi.fn(() => new Response("unexpected outbound"));
		const script = `export default {async fetch(request,env) {
    const token=await env.IDENTITY.getToken();
    const claims=JSON.parse(atob(token.split('.')[1].replaceAll('-','+').replaceAll('_','/')));
    const jwks=await (await fetch(claims.iss+'/.well-known/jwks.json')).json();
    const key=await crypto.subtle.importKey('jwk',jwks.keys[0],{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
    const signature=Uint8Array.from(atob(token.split('.')[2].replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
    const verified=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,signature,new TextEncoder().encode(token.split('.').slice(0,2).join('.')));
    return Response.json({claims,verified,jwks});
  }};`;
		const mf = new Miniflare(
			legacy
				? convertV4MiniflareOptions({
						name: "sender",
						modules: true,
						script,
						host: "127.0.0.1",
						enableDevRegistry: false,
						cf: false,
						compatibilityDate: "2026-10-01",
						identities: { IDENTITY: { audience: "urn:local-api" } },
						outboundService: outbound,
					})
				: {
						host: "127.0.0.1",
						enableDevRegistry: false,
						cf: false,
						workers: [
							{
								config: {
									name: "sender",
									compatibilityDate: "2026-10-01",
									manifest: singleModuleManifest(script),
									env: {
										IDENTITY: { type: "identity", audience: "urn:local-api" },
									},
								},
								dev: {
									outboundService: { type: "fetcher", handler: outbound },
								},
							},
						],
					}
		);
		useDispose(mf);
		const result = (await (
			await mf.dispatchFetch("http://localhost/")
		).json()) as {
			claims: Record<string, unknown>;
			verified: boolean;
			jwks: { keys: Record<string, unknown>[] };
		};
		const metadata = await mf.getLocalIdentity();
		expect(result.verified).toBe(true);
		expect(result.claims).toMatchObject({
			iss: metadata?.issuer,
			sub: metadata?.workers.sender.subject,
			execution: "local",
			aud: "urn:local-api",
		});
		expect((result.claims.exp as number) - (result.claims.iat as number)).toBe(
			300
		);
		expect(JSON.stringify(result.jwks)).not.toContain("PRIVATE");
		expect(result.jwks.keys[0]).not.toHaveProperty("d");
		expect(JSON.stringify(metadata)).not.toMatch(
			/PRIVATE KEY|SIGNING_KEY|ROOT_A/
		);
		expect(outbound).not.toHaveBeenCalled();
	});
}

test("keeps local keys and subjects across reload/restart; separates projects and resets authority with replay", async ({
	expect,
}) => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "local-identity-"));
	try {
		const make = (script: string, persist = true) => ({
			host: "127.0.0.1",
			enableDevRegistry: false,
			cf: false as const,
			resourcePersistencePath: persist ? root : undefined,
			workers: [
				{
					config: {
						name: "sender",
						compatibilityDate: "2026-10-01",
						manifest: singleModuleManifest(script),
						env: {
							IDENTITY: { type: "identity" as const, audience: "urn:api" },
						},
					},
					dev: { rootPath: root },
				},
			],
		});
		const script =
			"export default {async fetch(request,env){return new Response(await env.IDENTITY.getToken())}}";
		const first = new Miniflare(make(script));
		useDispose(first);
		const token = await (await first.dispatchFetch("http://localhost/")).text();
		const metadata = await first.getLocalIdentity();
		const collision = new Miniflare(make(script));
		await expect(collision.ready).rejects.toThrow(
			"Another local runtime owns identity state"
		);
		await collision.dispose().catch(() => {});
		const separateRoot = path.join(root, "separate");
		await fs.mkdir(separateRoot);
		const separateOptions = make(script);
		separateOptions.workers[0].dev.rootPath = separateRoot;
		const separate = new Miniflare(separateOptions);
		useDispose(separate);
		expect((await separate.getLocalIdentity())?.issuer).not.toBe(
			metadata?.issuer
		);
		expect(
			(await separate.getLocalIdentity())?.workers.sender.subject
		).not.toBe(metadata?.workers.sender.subject);
		await separate.dispose();

		await first.setOptions(make(script + "; // change"));
		expect((await first.getLocalIdentity())?.issuer).toBe(metadata?.issuer);
		expect((await first.getLocalIdentity())?.workers.sender.subject).toBe(
			metadata?.workers.sender.subject
		);
		expect((await first.getLocalIdentity())?.workers.sender.revision).not.toBe(
			metadata?.workers.sender.revision
		);
		await first.dispose();
		const second = new Miniflare(make(script));
		useDispose(second);
		expect((await second.getLocalIdentity())?.issuer).toBe(metadata?.issuer);
		expect(
			await (await second.dispatchFetch("http://localhost/")).text()
		).not.toBe(token);
		const authorityFiles = await fs.readdir(path.join(root, "identity"));
		const authority = path.join(
			root,
			"identity",
			authorityFiles[0],
			"authority.json"
		);
		expect((await fs.stat(authority)).mode & 0o777).toBe(0o600);
		await second.dispose();
		const lock = path.join(path.dirname(authority), "owner.json");
		await fs.writeFile(
			lock,
			JSON.stringify({ pid: 2147483647, owner: "crashed" })
		);
		const crashed = new Miniflare(make(script));
		await expect(crashed.ready).rejects.toThrow("exited without cleanup");
		await crashed.dispose().catch(() => {});
		expect(JSON.parse(await fs.readFile(lock, "utf8")).owner).toBe("crashed");
		await fs.unlink(lock);
		const recovered = new Miniflare(make(script));
		useDispose(recovered);
		expect((await recovered.getLocalIdentity())?.issuer).toBe(metadata?.issuer);
		await recovered.dispose();
		const isolated = new Miniflare(make(script, false));
		useDispose(isolated);
		expect((await isolated.getLocalIdentity())?.issuer).not.toBe(
			metadata?.issuer
		);
		await isolated.dispose();
		await removeDir(path.join(root, "identity"));
		const reset = new Miniflare(make(script));
		useDispose(reset);
		expect((await reset.getLocalIdentity())?.issuer).not.toBe(metadata?.issuer);
		await reset.dispose();
	} finally {
		await removeDir(root);
	}
});

// This contract needs the companion runtime until its published release lands.
// No local polyfill may turn decoding or a mocked claim into verified identity.
test.skipIf(!process.env.MINIFLARE_WORKERD_PATH)(
	"runtime caller needs no binding and rejects invalid credentials without outbound discovery",
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
	"verifies local JWT and WBA URLs through the native API; rejects tamper, cross-realm credentials and replay across reload/restart",
	async ({ expect }) => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), "identity-replay-"));
		const outbound = vi.fn(() => new Response("unexpected network"));
		const receiverScript = `export default {async fetch(request,env,ctx){
    try {const caller=await ctx.identity.caller();const body=await request.text();return Response.json({caller,url:request.url,body,headers:Object.fromEntries(request.headers)});}
    catch(error){return Response.json({error:error.name},{status:401});}
  }};`;
		const senderScript = `export default {async fetch(request,env){
    const path=new URL(request.url).pathname;
    if(path==='/token')return new Response(await env.IDENTITY.getToken());
    if(path==='/unsigned')return fetch('https://receiver.local.test/items');
    if(path==='/jwt')return fetch('https://receiver.local.test/items',{headers:{authorization:'Bearer '+await env.IDENTITY.getToken()}});
    if(path==='/external'){try {return await (await env.IDENTITY.getIdentity()).fetch('https://missing.local.test/items');}catch(error){return new Response(error.message);}}
    return (await env.IDENTITY.getIdentity('customer')).fetch('https://receiver.local.test/items?q=1',{method:'POST',body:'original'});
  }};`;
		const options = {
			host: "127.0.0.1",
			cf: false as const,
			enableDevRegistry: false,
			resourcePersistencePath: root,
			workers: [
				{
					config: {
						name: "sender",
						compatibilityDate: "2026-10-31",
						compatibilityFlags: ["enable_workload_identity_context"],
						manifest: singleModuleManifest(senderScript),
						env: {
							IDENTITY: {
								type: "identity" as const,
								audience: "urn:api",
								request_signing: {
									allowed_origins: [
										"https://receiver.local.test",
										"https://missing.local.test",
									],
									allowed_methods: ["GET", "POST"],
								},
							},
						},
					},
					dev: {
						rootPath: root,
						outboundService: { type: "fetcher" as const, handler: outbound },
					},
				},
				{
					config: {
						name: "receiver",
						compatibilityDate: "2026-10-31",
						compatibilityFlags: ["enable_workload_identity_context"],
						manifest: singleModuleManifest(receiverScript),
					},
					dev: {
						rootPath: root,
						outboundService: { type: "fetcher" as const, handler: outbound },
					},
				},
			],
		};
		let mf = new Miniflare(options);
		useDispose(mf);
		try {
			const metadata = await mf.getLocalIdentity();
			const jwt = (await (
				await mf.dispatchFetch("http://localhost/jwt")
			).json()) as { caller: unknown };
			expect(jwt.caller).toMatchObject({
				kind: "jwt",
				issuer: metadata?.issuer,
				subject: metadata?.workers.sender.subject,
				audience: "urn:api",
				originVersionId: metadata?.workers.sender.revision,
			});
			expect(
				await (await mf.dispatchFetch("http://localhost/unsigned")).json()
			).toMatchObject({ caller: null });
			const signed = (await (
				await mf.dispatchFetch("http://localhost/signed")
			).json()) as {
				caller: { kind: string };
				url: string;
				headers: Record<string, string>;
				body: string;
			};
			expect(signed).toMatchObject({
				url: "https://receiver.local.test/items?q=1",
				body: "original",
			});
			expect(signed.caller.kind).toBe("signed-request");
			delete signed.headers["content-length"];
			const send = async (
				url = signed.url,
				body = signed.body,
				headers = signed.headers
			) =>
				(await mf.getWorker("receiver")).fetch(url, {
					method: "POST",
					headers,
					body,
				});
			for (const request of [
				() => send(signed.url, signed.body + "tampered"),
				() => send(signed.url + "&changed=1"),
				() =>
					send(signed.url, signed.body, {
						...signed.headers,
						signature: "invalid",
					}),
			]) {
				const response = await request();
				await response.text();
				expect(response.status).toBe(401);
			}
			{
				const response = await send();
				await response.text();
				expect(response.status).toBe(401);
			}
			await mf.setOptions(options);
			{
				const response = await send();
				await response.text();
				expect(response.status).toBe(401);
			}
			await mf.dispose();
			mf = new Miniflare(options);
			useDispose(mf);
			{
				const response = await send();
				await response.text();
				expect(response.status).toBe(401);
			}
			const other = new Miniflare({
				...options,
				resourcePersistencePath: undefined,
			});
			useDispose(other);
			const otherToken = await (
				await other.dispatchFetch("http://localhost/token")
			).text();
			const receiver = await mf.getWorker("receiver");
			const token = await (
				await mf.dispatchFetch("http://localhost/token")
			).text();
			for (const credential of [otherToken, token.slice(0, -8) + "tampered"]) {
				const response = await receiver.fetch(
					"https://receiver.local.test/items",
					{ headers: { authorization: "Bearer " + credential } }
				);
				await response.text();
				expect(response.status).toBe(401);
			}

			expect(
				await (await mf.dispatchFetch("http://localhost/external")).text()
			).toContain("no Worker in this local graph");
			expect(outbound).not.toHaveBeenCalled();
		} finally {
			await mf.dispose();
			await removeDir(root);
		}
	}
);
