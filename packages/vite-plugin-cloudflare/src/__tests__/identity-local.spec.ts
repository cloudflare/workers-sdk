import assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import { removeDirSync } from "@cloudflare/workers-utils";
import { createServer } from "vite";
import { onTestFinished, test } from "vitest";

test("issues and verifies a real local identity through Vite", async ({
	expect,
}) => {
	const native = !!process.env.MINIFLARE_WORKERD_PATH;
	const parent = path.resolve(__dirname, "fixtures", "identity-local");
	fs.mkdirSync(parent, { recursive: true });
	const root = fs.realpathSync(fs.mkdtempSync(path.join(parent, "case-")));
	onTestFinished(() => removeDirSync(root));
	fs.writeFileSync(
		path.join(root, "index.ts"),
		`export default {async fetch(request,env,ctx){
  if(new URL(request.url).pathname==='/receive')return Response.json(await ctx.identity.caller());
  const token=await env.IDENTITY.getToken();const c=JSON.parse(atob(token.split('.')[1].replaceAll('-','+').replaceAll('_','/')));
  const jwks=await(await fetch(c.iss+'/.well-known/jwks.json')).json();
  const key=await crypto.subtle.importKey('jwk',jwks.keys[0],{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  const verified=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,Uint8Array.from(atob(token.split('.')[2].replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0)),new TextEncoder().encode(token.split('.').slice(0,2).join('.')));
  const signed=${native} ? await (await (await env.IDENTITY.getIdentity()).fetch('https://identity-vite.local.test/receive')).json() : undefined;
  return Response.json({execution:c.execution,audience:c.aud,verified,...(${native}?{signed}:{})});
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
						name: "identity-vite",
						entrypoint: "./index.ts",
						compatibilityDate: "2026-10-01",
						compatibilityFlags: native
							? ["enable_workload_identity_context"]
							: [],
						env: {
							IDENTITY: {
								type: "identity",
								audience: "urn:vite",
								request_signing: {
									resources: [
										{
											origin: "https://identity-vite.local.test",
											methods: ["GET"],
										},
									],
								},
							},
						},
					},
				}),
				inspectorPort: false,
				persistState: false,
				types: { generate: false },
			}),
		],
	});
	onTestFinished(() => server.close());
	await server.listen(0);
	const url = server.resolvedUrls?.local[0];
	assert(url);
	const response = await fetch(url);
	const body = await response.text();
	expect(response.status, body).toBe(200);
	expect(JSON.parse(body)).toEqual({
		execution: "local",
		audience: "urn:vite",
		verified: true,
		...(native
			? { signed: expect.objectContaining({ kind: "signed-request" }) }
			: {}),
	});
});
