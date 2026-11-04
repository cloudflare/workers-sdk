import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { test } from "vitest";
import { singleModuleManifest, useDispose } from "../../test-shared";

// Independent Node producer: does not call the managed verifier's signing helpers.
function producer() {
	const key = () => generateKeyPairSync("ec", { namedCurve: "P-256" });
	const operator = key(),
		session = key(),
		proof = key();
	const publicKey = (pair: ReturnType<typeof key>) =>
		pair.publicKey.export({ format: "jwk" });
	const sessionJwk = publicKey(session),
		proofJwk = publicKey(proof);
	const thumb = (jwk: ReturnType<typeof publicKey>) =>
		createHash("sha256")
			.update(
				JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y })
			)
			.digest("base64url");
	const jwt = (
		header: object,
		payload: object,
		pair: ReturnType<typeof key>
	) => {
		const input = [header, payload]
			.map((value) => Buffer.from(JSON.stringify(value)).toString("base64url"))
			.join(".");
		return `${input}.${sign("sha256", Buffer.from(input), { key: pair.privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url")}`;
	};
	const issuer = "https://receiver.local.test",
		clientId = `${issuer}/client.json`;
	const callerIdentity = {
		profile: "poppy-0.3" as const,
		accountTokens: {
			issuer,
			audience: "https://api.shop.example",
		},
	};
	const documents = {
		"/.well-known/oauth-authorization-server": {
			issuer,
			jwks_uri: `${issuer}/jwks.json`,
		},
		"/client.json": { client_id: clientId, jwks_uri: `${issuer}/jwks.json` },
		"/jwks.json": {
			keys: [{ ...publicKey(operator), kid: "operator", alg: "ES256" }],
		},
	};
	const request = (
		jti: string,
		mode: "signed-out" | "bearer" | "dpop" = "dpop"
	) => {
		const now = Math.floor(Date.now() / 1000),
			htu = "http://localhost/orders";
		const token =
			mode === "signed-out"
				? undefined
				: jwt(
						{ alg: "ES256", typ: "at+jwt", kid: "operator" },
						{
							iss: issuer,
							sub: "account-user",
							aud: "https://api.shop.example",
							iat: now,
							exp: now + 300,
							jti: `token-${jti}`,
							client_id: clientId,
							scope: "orders:read",
							...(mode === "dpop" ? { cnf: { jkt: thumb(proofJwk) } } : {}),
						},
						operator
					);
		const ath = token
			? createHash("sha256").update(token).digest("base64url")
			: undefined;
		const delegation = jwt(
			{ alg: "ES256", typ: "poppy-delegation+jwt", kid: "operator" },
			{
				iss: clientId,
				iat: now,
				exp: now + 3600,
				jti: "delegation",
				cnf: { jwk: sessionJwk },
			},
			operator
		);
		const headers: Record<string, string> = {
			"Poppy-Session": jwt(
				{
					alg: "ES256",
					typ: "poppy-session+jwt",
					kid: thumb(sessionJwk),
					poppy_dlg: delegation,
				},
				{
					iss: clientId,
					aud: issuer,
					sid: "session-123",
					sub: "pairwise-user",
					agent_id: "🤖".repeat(100),
					iat: now,
					jti,
					htm: "GET",
					htu,
					...(ath ? { ath } : {}),
				},
				session
			),
		};
		if (token) {
			headers.Authorization = `${mode === "dpop" ? "DPoP" : "Bearer"} ${token}`;
		}
		if (mode === "dpop") {
			headers.DPoP = jwt(
				{ alg: "ES256", typ: "dpop+jwt", jwk: proofJwk },
				{ iat: now, jti: `proof-${jti}`, htm: "GET", htu, ath },
				proof
			);
		}
		return headers;
	};
	return { callerIdentity, documents, request };
}

for (const legacy of [false, true]) {
	test(`verifies delegated credentials and shared replay through native caller (${legacy ? "legacy" : "config"})`, async ({
		expect,
	}) => {
		const f = producer();
		const script = `const documents=${JSON.stringify(f.documents)};
 export default {async fetch(request,env,ctx){
 const path=new URL(request.url).pathname;
 if(documents[path])return Response.json(documents[path]);
 try {const caller=await ctx.identity.caller();return Response.json({caller,frozen:caller&&Object.isFrozen(caller)&&(!caller.account||(Object.isFrozen(caller.account)&&Object.isFrozen(caller.account.scopes)))});}
 catch(error){return Response.json({name:error.name,response:error.response??null},{status:error.response?.status??503});}
 }};`;
		const mf = new Miniflare(
			legacy
				? convertV4MiniflareOptions({
						name: "receiver",
						modules: true,
						script,
						host: "127.0.0.1",
						enableDevRegistry: false,
						cf: false,
						callerIdentity: f.callerIdentity,
						compatibilityDate: "2026-10-31",
					})
				: {
						host: "127.0.0.1",
						enableDevRegistry: false,
						cf: false,
						workers: [
							{
								config: {
									name: "receiver",
									compatibilityDate: "2026-10-31",
									callerIdentity: f.callerIdentity,
									manifest: singleModuleManifest(script),
								},
							},
						],
					}
		);
		useDispose(mf);
		for (const mode of ["signed-out", "bearer", "dpop"] as const) {
			const headers = f.request(`fresh-${mode}`, mode);
			const response = await mf.dispatchFetch("http://localhost/orders", {
				headers,
			});
			const body = await response.text();
			expect(response.status, body).toBe(200);
			expect(JSON.parse(body)).toMatchObject({
				frozen: true,
				caller: {
					kind: "delegated-request",
					userId: "pairwise-user",
					sessionId: "session-123",
					agentId: "🤖".repeat(100),
					...(mode === "signed-out"
						? {}
						: {
								account: { subject: "account-user", scopes: ["orders:read"] },
							}),
				},
			});
			const duplicate = await mf.dispatchFetch("http://localhost/orders", {
				headers,
			});
			expect(duplicate.status).toBe(400);
			expect(await duplicate.json()).toMatchObject({
				name: "WorkloadIdentityError",
				response: { status: 400, body: { error: "invalid_session" } },
			});
		}
	});
}

test("tooling proxy bindings preserve HTTP verification without asserting native provenance", async ({
	expect,
}) => {
	const f = producer();
	const receiverScript = `const documents=${JSON.stringify(f.documents)};export default {async fetch(request,env,ctx){const path=new URL(request.url).pathname;if(documents[path])return Response.json(documents[path]);return Response.json(await ctx.identity.caller());}};`;
	const mf = new Miniflare({
		host: "127.0.0.1",
		enableDevRegistry: false,
		cf: false,
		workers: [
			{
				config: {
					name: "tooling-proxy",
					compatibilityDate: "2026-10-31",
					manifest: singleModuleManifest(
						"export default {fetch(request,env){return env.RECEIVER.fetch(request)}}"
					),
					env: { RECEIVER: { type: "worker", worker: "receiver" } },
				},
				dev: { unsafeSuppressNativeCaller: true },
			},
			{
				config: {
					name: "receiver",
					compatibilityDate: "2026-10-31",
					callerIdentity: f.callerIdentity,
					manifest: singleModuleManifest(receiverScript),
				},
			},
		],
	});
	useDispose(mf);
	expect(
		await (await mf.dispatchFetch("http://localhost/orders")).json()
	).toBeNull();
	expect(
		await (
			await mf.dispatchFetch("http://localhost/orders", {
				headers: f.request("through-proxy"),
			})
		).json()
	).toMatchObject({
		kind: "delegated-request",
		userId: "pairwise-user",
		account: { subject: "account-user" },
	});
});

test("rejects the previous local receiver key instead of dropping trust", ({
	expect,
}) => {
	expect(() =>
		convertV4MiniflareOptions({
			modules: true,
			script: "export default {}",
			identityReceiver: producer().callerIdentity,
		} as never)
	).toThrow(/callerIdentity/);
});
