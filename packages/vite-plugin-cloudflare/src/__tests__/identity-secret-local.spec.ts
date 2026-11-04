import assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import { removeDirSync } from "@cloudflare/workers-utils";
import { Miniflare } from "miniflare";
import { createServer } from "vite";
import { onTestFinished, test } from "vitest";

test("stored-secret discovery waits for auxiliary Vite runners and stays private", async ({
	expect,
}) => {
	const parent = path.resolve(__dirname, "fixtures", "identity-local");
	fs.mkdirSync(parent, { recursive: true });
	const root = fs.realpathSync(fs.mkdtempSync(path.join(parent, "secret-")));
	onTestFinished(() => removeDirSync(root));
	const persist = path.join(root, "state", "v3");
	const seed = new Miniflare({
		cf: false,
		enableDevRegistry: false,
		unsafeLocalExplorer: true,
		resourcePersistencePath: persist,
		workers: [
			{
				config: {
					name: "seed",
					compatibilityDate: "2026-10-01",
					manifest: {
						mainModule: "seed.js",
						modules: {
							"seed.js": {
								type: "esm",
								contents:
									"export default {fetch(){return new Response('seed')}}",
							},
						},
					},
				},
			},
		],
	});
	try {
		const response = await seed.dispatchFetch(
			"http://localhost/cdn-cgi/local/explorer/api/secrets_store/stores/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/secrets",
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify([
					{ name: "CLIENT_SECRET", value: "test-secret", scopes: ["workers"] },
				]),
			}
		);
		expect(response.status, await response.text()).toBe(200);
	} finally {
		await seed.dispose();
	}
	fs.writeFileSync(
		path.join(root, "app.ts"),
		`export default {async fetch(request,env){if(Object.keys(env).some(k=>k.includes('SECRET')))throw new Error('public secret');return (await env.API.getIdentity()).fetch('https://provider.local.test/orders')}};`
	);
	fs.writeFileSync(
		path.join(root, "provider.ts"),
		`export default {async fetch(request){
  const url=new URL(request.url);
  if(url.pathname==='/.well-known/oauth-authorization-server')return Response.json({issuer:'https://provider.local.test',token_endpoint:'https://provider.local.test/token'});
  if(url.pathname==='/token')return request.headers.get('authorization')==='Basic '+btoa('client:test-secret')&&!request.headers.has('DPoP')?Response.json({access_token:'opaque',token_type:'Bearer'}):new Response('bad exchange',{status:401});
  return new Response(request.headers.get('authorization')==='Bearer opaque'?'private-local-ok':'bad delivery');
 }};`
	);
	const server = await createServer({
		root,
		configFile: false,
		logLevel: "silent",
		server: { host: "127.0.0.1" },
		plugins: [
			cloudflare({
				config: (loaded) => ({
					...loaded,
					worker: {
						...loaded.worker,
						name: "secret-app",
						entrypoint: "./app.ts",
						compatibilityDate: "2026-10-01",
						env: {
							API: {
								type: "identity",
								oauth: {
									exchange: "client_credentials",
									client_id: "client",
									authorization_server: "https://provider.local.test",
									authentication: {
										method: "client_secret_basic",
										secret_reference: {
											store_id: "a".repeat(32),
											secret_name: "CLIENT_SECRET",
										},
									},
									resources: [
										{ origin: "https://provider.local.test", methods: ["GET"] },
									],
								},
							},
						},
					},
				}),
				auxiliaryWorkers: [
					{
						config: {
							name: "provider",
							entrypoint: "./provider.ts",
							compatibilityDate: "2026-10-01",
						},
					},
				],
				inspectorPort: false,
				persistState: { path: path.join(root, "state") },
				remoteBindings: false,
				types: { generate: false },
			}),
		],
	});
	onTestFinished(() => server.close());
	await server.listen(0);
	const url = server.resolvedUrls?.local[0];
	assert(url);
	const response = await fetch(url);
	expect(await response.text()).toBe("private-local-ok");
	expect(response.status).toBe(200);
});
