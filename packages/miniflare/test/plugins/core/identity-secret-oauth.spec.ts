import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { removeDir } from "@cloudflare/workers-utils";
import { Miniflare } from "miniflare";
import { test } from "vitest";
import { singleModuleManifest, useDispose } from "../../test-shared";

for (const [method, discover] of [
	["client_secret_basic", false],
	["client_secret_post", false],
	["client_secret_basic", true],
] as const) {
	test(`stored-secret ${method}, discovery ${discover} works privately through the local binding`, async ({
		expect,
	}) => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), "identity-secret-"));
		const storeId = "a".repeat(32),
			secretName = "CLIENT_SECRET";
		const seed = new Miniflare({
			resourcePersistencePath: root,
			unsafeLocalExplorer: true,
			enableDevRegistry: false,
			cf: false,
			workers: [
				{
					config: {
						name: "seed",
						compatibilityDate: "2026-10-01",
						manifest: singleModuleManifest(
							"export default {fetch(){return new Response('seed')}}"
						),
					},
				},
			],
		});
		try {
			const response = await seed.dispatchFetch(
				`http://localhost/cdn-cgi/local/explorer/api/secrets_store/stores/${storeId}/secrets`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify([
						{ name: secretName, value: "test-secret", scopes: ["workers"] },
					]),
				}
			);
			expect(response.status, await response.text()).toBe(200);
		} finally {
			await seed.dispose();
		}
		const provider = `export default {async fetch(request){
   const url = new URL(request.url);
   if (url.pathname === '/.well-known/oauth-authorization-server') return Response.json({issuer:'https://provider.local.test', token_endpoint:'https://provider.local.test/token'});
   if (url.pathname === '/token') {
    const body = new URLSearchParams(await request.text());
    const good = body.get('grant_type') === 'client_credentials' && !body.has('scope') && !body.has('resource') && !body.has('client_assertion') && !request.headers.has('DPoP') &&
     (${JSON.stringify(method)} === 'client_secret_basic' ? request.headers.get('authorization') === 'Basic '+btoa('client:test-secret') && !body.has('client_id') && !body.has('client_secret') : !request.headers.has('authorization') && body.get('client_id') === 'client' && body.get('client_secret') === 'test-secret');
    return good ? Response.json({access_token:'opaque-token', token_type:'Bearer'}) : new Response('invalid credentials',{status:401});
   }
   return new Response(request.headers.get('authorization') === 'Bearer opaque-token' && !request.headers.has('dpop') ? 'verified' : 'bad delivery', {status: request.headers.get('authorization') === 'Bearer opaque-token' ? 200 : 401});
  }};`;
		const mf = new Miniflare({
			resourcePersistencePath: root,
			enableDevRegistry: false,
			cf: false,
			workers: [
				{
					config: {
						name: "app",
						compatibilityDate: "2026-10-01",
						env: {
							API: {
								type: "identity",
								oauth: {
									exchange: "client_credentials",
									client_id: "client",
									authorization_server: "https://provider.local.test",
									...(discover
										? {}
										: { token_endpoint: "https://provider.local.test/token" }),
									authentication: {
										method,
										secret_reference: {
											store_id: storeId,
											secret_name: secretName,
										},
									},
									resources: [
										{ origin: "https://provider.local.test", methods: ["GET"] },
									],
								},
							},
						},
						manifest: singleModuleManifest(
							`export default {async fetch(request,env){ if(Object.keys(env).some(k=>k.includes('SECRET'))) throw new Error('public secret binding'); const identity=await env.API.getIdentity(); return identity.fetch('https://provider.local.test/orders'); }}`
						),
					},
				},
				{
					config: {
						name: "provider",
						compatibilityDate: "2026-10-01",
						manifest: singleModuleManifest(provider),
					},
				},
			],
		});
		useDispose(mf);
		try {
			const response = await mf.dispatchFetch("http://localhost/");
			expect(await response.text()).toBe("verified");
			expect(response.status).toBe(200);
		} finally {
			await mf.dispose();
			await removeDir(root);
		}
	});
}

test("missing referenced secrets fail startup without exposing a secret binding", async ({
	expect,
}) => {
	const mf = new Miniflare({
		cf: false,
		enableDevRegistry: false,
		workers: [
			{
				config: {
					name: "app",
					compatibilityDate: "2026-10-01",
					manifest: singleModuleManifest(
						"export default {fetch(){return new Response('unreachable')}}"
					),
					env: {
						API: {
							type: "identity",
							oauth: {
								exchange: "client_credentials",
								client_id: "client",
								authorization_server: "https://provider.local.test",
								token_endpoint: "https://provider.local.test/token",
								authentication: {
									method: "client_secret_basic",
									secret_reference: {
										store_id: "a".repeat(32),
										secret_name: "MISSING",
									},
								},
								resources: [
									{ origin: "https://provider.local.test", methods: ["GET"] },
								],
							},
						},
					},
				},
			},
		],
	});
	try {
		await expect(mf.ready).rejects.toThrow(
			/Referenced OAuth secret is unavailable/
		);
	} finally {
		await mf.dispose().catch(() => {});
	}
});
