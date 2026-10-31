import assert from "node:assert/strict";
import {
	Miniflare,
	type DevelopmentOidcBrokerFactory,
	type WorkerOptions,
} from "miniflare";
import { describe, test, vi } from "vitest";
import { singleModuleManifest, useDispose } from "../../test-shared";
const limits = {
	type: "identity" as const,
	audience: "urn:inventory",
	authorization_grants: {
		allowed_authorization_servers: ["https://auth.example"],
		allowed_scopes: ["read"],
	},
	request_signing: {
		profile: "cloudflare-workload-http-v1" as const,
		allowed_origins: ["https://api.example"],
		allowed_methods: ["GET", "POST"],
	},
};
function worker(
	script: string,
	developmentOidc?: DevelopmentOidcBrokerFactory
): WorkerOptions {
	return {
		config: {
			name: "linked",
			compatibilityDate: "2026-01-01",
			compatibilityFlags: ["workers_oidc"],
			env: { IDENTITY: limits },
			manifest: singleModuleManifest(script),
		},
		dev: { developmentOidc },
	};
}
describe("development OIDC private RPC shim", () => {
	test("issues fresh concurrent calls, rejects all getter arguments and hides the host broker", async ({
		expect,
	}) => {
		let serial = 0;
		const invoke = vi.fn(
			async (_call: unknown) => new Response(`token-${++serial}`)
		);
		const mf = new Miniflare({
			workers: [
				worker(
					`export default {async fetch(request,env){
   const tokens=await Promise.all(Array.from({length:8},()=>env.IDENTITY.getToken()));let rejected=0;
   for(const args of [[undefined],[{}],[{fresh:true}],[{audience:"other"}]])try{await env.IDENTITY.getToken(...args);}catch{rejected++;}
   return Response.json({tokens,rejected,env:Object.keys(env)});
  }};`,
					{ key: "one", create: () => ({ invoke, dispose() {} }) }
				),
			],
		});
		useDispose(mf);
		const result = (await (
			await mf.dispatchFetch("http://localhost/")
		).json()) as { tokens: string[]; rejected: number; env: string[] };
		expect(new Set(result.tokens).size).toBe(8);
		expect(result.rejected).toBe(4);
		expect(result.env).toEqual(["IDENTITY"]);
		expect(invoke).toHaveBeenCalledTimes(8);
		for (const [call] of invoke.mock.calls) {
			expect(call).toEqual({ binding: "IDENTITY", operation: "token" });
		}
	});
	test("dispatches grants and streams receiver errors without exposing credentials", async ({
		expect,
	}) => {
		const invoke = vi.fn(async (call: { operation: string }) =>
			call.operation === "grant"
				? new Response("grant")
				: new Response("receiver denied", {
						status: 403,
						headers: { "X-Receiver": "test" },
					})
		);
		const mf = new Miniflare({
			workers: [
				worker(
					`export default {async fetch(request,env){
   const grant=await env.IDENTITY.getAuthorizationGrant({authorizationServer:"https://auth.example",scope:["read"]});
   const response=await env.IDENTITY.fetch("https://api.example/items",{method:"POST",body:"hello",headers:{Authorization:"Bearer upstream"}});
   return Response.json({grant,status:response.status,body:await response.text(),marker:response.headers.get("X-MF-OIDC-Result")});
  }};`,
					{ key: "one", create: () => ({ invoke, dispose() {} }) }
				),
			],
		});
		useDispose(mf);
		const result = await mf.dispatchFetch("http://localhost/");
		const body = await result.text();
		expect(result.ok, body).toBe(true);
		expect(JSON.parse(body)).toEqual({
			grant: "grant",
			status: 403,
			body: "receiver denied",
			marker: null,
		});
		expect(invoke.mock.calls[1]?.[0]).toMatchObject({
			binding: "IDENTITY",
			operation: "fetch",
			request: {
				url: "https://api.example/items",
				method: "POST",
				body: btoa("hello"),
				headers: [
					["authorization", "Bearer upstream"],
					["content-type", "text/plain;charset=UTF-8"],
				],
			},
		});
	});
	test("checks destinations before reading bodies and fails closed without a broker", async ({
		expect,
	}) => {
		const invoke = vi.fn(async () => new Response("token"));
		const script = `export default {async fetch(request,env){let rejected=0;for(const url of ["http://api.example/","https://other.example/"])try{await env.IDENTITY.fetch(url,{method:"POST",body:new ReadableStream({pull(){throw new Error("body touched");}})});}catch(error){if(!error.message.includes("body touched"))rejected++;}try{await env.IDENTITY.getToken();}catch{rejected++;}return new Response(String(rejected));}};`;
		const mf = new Miniflare({ workers: [worker(script)] });
		useDispose(mf);
		expect(await (await mf.dispatchFetch("http://localhost/")).text()).toBe(
			"3"
		);
		expect(invoke).not.toHaveBeenCalled();
	});
	test("reuses equal broker keys and disposes changed configurations", async ({
		expect,
	}) => {
		const invoke = vi.fn(async () => new Response("token")),
			dispose = vi.fn(),
			create = vi.fn(() => ({ invoke, dispose }));
		const script = `export default {async fetch(r,e){return new Response(await e.IDENTITY.getToken());}};`;
		const options = worker(script, { key: "one", create }),
			mf = new Miniflare({ workers: [options] });
		useDispose(mf);
		await (await mf.dispatchFetch("http://localhost/")).text();
		await mf.setOptions({ workers: [options] });
		await (await mf.dispatchFetch("http://localhost/")).text();
		expect(create).toHaveBeenCalledOnce();
		await mf.setOptions({ workers: [worker(script, { key: "two", create })] });
		expect(dispose).toHaveBeenCalledOnce();
	});
	test("rejects caller transport overrides before the host sees a request", async ({
		expect,
	}) => {
		const invoke = vi.fn(async () => new Response("unexpected"));
		const mf = new Miniflare({
			workers: [
				worker(
					`export default {async fetch(r,e){let denied=0;
   for(const init of [{redirect:"follow"},{cf:{resolveOverride:"other.example"}},{headers:{Host:"other.example"}},{headers:{"Content-Length":"1"}}]) {
    try {await e.IDENTITY.fetch("https://api.example/",init);} catch {denied++;}
   }
   let reads=0;try {await e.IDENTITY.fetch("https://denied.example/",{method:"POST",body:new ReadableStream({pull(){reads++;}},{highWaterMark:0})});}catch{denied++;}
   return Response.json({denied,reads});
  }};`,
					{ key: "one", create: () => ({ invoke, dispose() {} }) }
				),
			],
		});
		useDispose(mf);
		expect(await (await mf.dispatchFetch("http://localhost/")).json()).toEqual({
			denied: 5,
			reads: 0,
		});
		expect(invoke).not.toHaveBeenCalled();
	});
	test("serializes FormData once before forwarding final bytes", async ({
		expect,
	}) => {
		const invoke = vi.fn(async (_call: unknown) => new Response("ok"));
		const mf = new Miniflare({
			workers: [
				worker(
					`export default {async fetch(r,e){const body=new FormData();body.set("message","hello");return e.IDENTITY.fetch("https://api.example/",{method:"POST",body});}};`,
					{ key: "one", create: () => ({ invoke, dispose() {} }) }
				),
			],
		});
		useDispose(mf);
		expect(await (await mf.dispatchFetch("http://localhost/")).text()).toBe(
			"ok"
		);
		const call = invoke.mock.calls[0]?.[0] as unknown as {
			request: { body: string; headers: [string, string][] };
		};
		const type = new Headers(call.request.headers).get("content-type");
		assert(type);
		expect(type).toMatch(/^multipart\/form-data; boundary=/);
		expect(atob(call.request.body)).toContain(type.split("boundary=")[1]);
		expect(atob(call.request.body)).toContain("hello");
	});
});
