import crypto from "node:crypto";
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { importPKCS8, SignJWT } from "jose";
import { Request, Response } from "miniflare";
import { defineConfig } from "vitest/config";

// Generate RSA keypair for signing/verifying JWTs
const authKeypair = crypto.generateKeyPairSync("rsa", {
	modulusLength: 4096,
	publicKeyEncoding: { type: "spki", format: "pem" },
	privateKeyEncoding: { type: "pkcs8", format: "pem" },
});
const authAlg = "RS256";
const authPrivateKey = await importPKCS8(authKeypair.privateKey, authAlg);

function isCredentialsObject(
	value: unknown
): value is { username: string; password: string } {
	return (
		typeof value === "object" &&
		value !== null &&
		"username" in value &&
		typeof value.username === "string" &&
		"password" in value &&
		typeof value.password === "string"
	);
}

// Mapping between usernames and passwords
const passwords: Record<string, string | undefined> = {
	admin: "lovelace",
};

async function handleAuthServiceOutbound(request: Request): Promise<Response> {
	const url = new URL(request.url);

	if (request.method === "POST" && url.pathname === "/login") {
		// If this is a login request, verify the username/password, then sign a JWT
		const body = await request.json();
		if (!isCredentialsObject(body)) {
			return new Response("Bad Request", { status: 400 });
		}
		if (passwords[body.username] !== body.password) {
			return new Response("Unauthorized", { status: 401 });
		}
		const payload = { "urn:example:username": body.username };
		const token = await new SignJWT(payload)
			.setProtectedHeader({ alg: authAlg })
			.setIssuedAt()
			.setIssuer("urn:example:issuer")
			.setAudience("urn:example:audience")
			.setExpirationTime("1h")
			.sign(authPrivateKey);
		return Response.json({ token });
	}

	return new Response("Not Found", { status: 404 });
}

export default defineConfig({
	plugins: [
		cloudflareTest({
			// Configuration for the test runner and "API service" Worker
			wrangler: {
				configPath: "./api-service/wrangler.jsonc",
			},
			miniflare: {
				bindings: {
					TEST_AUTH_PUBLIC_KEY: authKeypair.publicKey,
				},

				workers: [
					// Configuration for "auxiliary" Worker dependencies.
					// Unfortunately, auxiliary Workers cannot load their configuration
					// from `wrangler.toml` files, and must be configured with Miniflare
					// `WorkerOptions`.
					{
						name: "auth-service",
						modules: true,
						scriptPath: "./auth-service/dist/index.js", // Built by `global-setup.ts`
						compatibilityDate: "2024-01-01",
						compatibilityFlags: ["nodejs_compat"],
						bindings: { AUTH_PUBLIC_KEY: authKeypair.publicKey },
						// Mock outbound `fetch()`es from the `auth-service`
						outboundService: handleAuthServiceOutbound,
					},
					{
						name: "database-service",
						modules: true,
						scriptPath: "./database-service/dist/index.js", // Built by `global-setup.ts`
						compatibilityDate: "2024-01-01",
						compatibilityFlags: ["nodejs_compat"],
						kvNamespaces: ["KV_NAMESPACE"],
					},
					{
						name: "tail-consumer",
						modules: [
							{
								path: "index.js",
								type: "ESModule",
								contents: /* javascript */ `
                                export default {
                                    tail(event) {
                                    console.log("tail event received")
                                    }
                                }
                                `,
							},
						],
						compatibilityDate: "2024-01-01",
					},
				],
			},
		}),
	],

	test: {
		globalSetup: ["./global-setup.ts"],
	},
});
