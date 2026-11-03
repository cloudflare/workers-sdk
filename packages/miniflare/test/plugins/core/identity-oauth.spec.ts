import fs from "node:fs/promises";
import path from "node:path";
import { Miniflare, Response } from "miniflare";
import { test, vi } from "vitest";
import { singleModuleManifest, useDispose } from "../../test-shared";

for (const exchange of [
	"workload_authorization",
	"client_credentials",
] as const) {
	for (const tokenType of ["Bearer", "DPoP"]) {
		for (const combined of [false, true]) {
			test(`local OAuth ${exchange}, ${tokenType}, WBA ${combined} verifies actual credentials offline`, async ({
				expect,
			}) => {
				const outbound = vi.fn(() => new Response("unexpected remote request"));
				const fixture = await fs.readFile(
					path.resolve(import.meta.dirname, "../../fixtures/identity-oauth.js"),
					"utf8"
				);
				const base = "https://provider.local.test/runs/local";
				const script = `export default {async fetch(request,env){
      const identity=await env.OAUTH.getIdentity();
      if(new URL(request.url).pathname==='/setup') {
        const token=await env.OIDC.getToken();
        const claims=JSON.parse(atob(token.split('.')[1].replaceAll('-','+').replaceAll('_','/')));
        const jwks=await(await fetch(claims.iss+'/.well-known/wag-jwks.json')).json();
        const client=${exchange === "client_credentials"} ? await identity.getClientMetadata() : undefined;
        const registration={authorizationServer:'${base}',resource:'${base}/api',signatureAgent:${combined} ? await identity.signatureAgent : 'https://unused.local.test',scopes:['items:read','items:write'],requireWba:${combined},requireNonce:true,tokenType:'${tokenType}',...(${exchange === "client_credentials"} ? {client:{id:'local-client',jwks:client.jwks}} : {wag:{issuer:claims.iss,subject:claims.sub,jwks}})};
        return fetch('${base}/__test/registration',{method:'PUT',headers:{authorization:'Bearer local-admin'},body:JSON.stringify(registration)});
      }
      return identity.fetch('${base}/api/items?q=one',{method:'POST',body:'local body'});
    }};`;
				const mf = new Miniflare({
					host: "127.0.0.1",
					cf: false,
					enableDevRegistry: false,
					workers: [
						{
							config: {
								name: "sender",
								compatibilityDate: "2026-10-01",
								manifest: singleModuleManifest(script),
								env: {
									OIDC: { type: "identity", audience: "urn:local" },
									OAUTH: {
										type: "identity",
										oauth: {
											...(exchange === "client_credentials"
												? {
														exchange: "client_credentials" as const,
														client_id: "local-client",
													}
												: { exchange: "workload_authorization" as const }),
											authorization_server: base,
											token_endpoint: base + "/oauth/token",
											resource: base + "/api",
											scope: ["items:read", "items:write"],
											allowed_origins: ["https://provider.local.test"],
											allowed_methods: ["POST"],
											...(combined
												? { http_message_signatures: "web_bot_auth" as const }
												: {}),
										},
									},
								},
							},
							dev: { outboundService: { type: "fetcher", handler: outbound } },
						},
						{
							config: {
								name: "provider",
								compatibilityDate: "2026-07-01",
								compatibilityFlags: ["nodejs_compat"],
								manifest: singleModuleManifest(fixture),
								exports: {
									QualificationState: {
										type: "durable-object",
										storage: "sqlite",
									},
								},
								env: {
									STATE: {
										type: "durable-object",
										exportName: "QualificationState",
										worker: "provider",
									},
									ADMIN_TOKEN: { type: "text", value: "local-admin" },
									LIMITER: {
										type: "worker",
										worker: "provider",
										exportName: "Limiter",
									},
								},
							},
							dev: { outboundService: { type: "fetcher", handler: outbound } },
						},
					],
				});
				useDispose(mf);
				const setup = await mf.dispatchFetch("http://localhost/setup");
				expect(await setup.json()).toEqual({ registered: true });
				for (let i = 0; i < 2; i++) {
					const response = await mf.dispatchFetch("http://localhost/call");
					const body = await response.text();
					expect(response.status, body).toBe(200);
					expect(JSON.parse(body)).toMatchObject({
						body: "local body",
						query: "?q=one",
					});
				}
				const provider = await mf.getWorker("provider");
				const state = await (
					await provider.fetch(base + "/__test/state", {
						headers: { authorization: "Bearer local-admin" },
					})
				).json();
				expect(state).toMatchObject({ executions: 2 });
				expect(outbound).not.toHaveBeenCalled();
			});
		}
	}
}
