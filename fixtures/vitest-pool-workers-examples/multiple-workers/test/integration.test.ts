import { env, SELF } from "cloudflare:test";
import { importSPKI, jwtVerify } from "jose"; // Check importing external module
import { it } from "vitest";
import type { ExpectStatic } from "vitest";

async function login(
	username: string,
	password: string,
	expect: ExpectStatic
): Promise<string> {
	const formData = new FormData();
	formData.set("username", username);
	formData.set("password", password);
	const response = await SELF.fetch("https://example.com/login", {
		method: "POST",
		body: formData,
	});
	expect(response.status).toBe(200);
	const { token } = await response.json<{ token: string }>();
	expect(token).toMatch(/^ey/);
	return token;
}

it("logs in and generates token for user", async ({ expect }) => {
	// Login and get token
	const token = await login("admin", "lovelace", expect);

	// Verify token is valid
	const alg = "RS256";
	const publicKey = await importSPKI(env.TEST_AUTH_PUBLIC_KEY, alg);
	const { payload } = await jwtVerify(token, publicKey, {
		issuer: "urn:example:issuer",
		audience: "urn:example:audience",
	});
	expect(payload).toStrictEqual({
		"urn:example:username": "admin",
		iss: "urn:example:issuer",
		aud: "urn:example:audience",
		iat: expect.any(Number),
		exp: expect.any(Number),
	});
});

it("stores in user's database", async ({ expect }) => {
	// Login and get token
	const token = await login("admin", "lovelace", expect);

	// Read and write from the database
	let response = await SELF.fetch("https://example.com/key", {
		method: "PUT",
		body: "value",
		headers: { Authorization: `Bearer ${token}` },
	});
	expect(response.status).toBe(204);
	response = await SELF.fetch("https://example.com/key", {
		headers: { Authorization: `Bearer ${token}` },
	});
	expect(response.status).toBe(200);
	expect(await response.text()).toBe("value");

	// Check key written under user's namespace
	response = await env.DATABASE_SERVICE.fetch("https://placeholder/admin/key");
	expect(response.status).toBe(200);
	expect(await response.text()).toBe("value");
});
