import { env } from "cloudflare:workers";
import { it } from "vitest";
it("uses source-built local signing and private request verification", async ({
	expect,
}) => {
	using a = await env.IDENTITY.getIdentity("agent-a"),
		b = await env.IDENTITY.getIdentity("agent-b");
	const token = await a.getToken(),
		other = await b.getToken();
	const decode = (value) =>
		JSON.parse(
			atob(value.split(".")[1].replaceAll("-", "+").replaceAll("_", "/"))
		);
	expect(decode(token).sub).not.toBe(decode(other).sub);
	expect(decode(token).sub).toBe(`agent:${await a.id}`);
	const grant = await a.getAuthorizationGrant({
		authorizationServer: "https://as.identity.local",
		scope: ["read"],
	});
	expect(decode(grant).sub).toBe(decode(token).sub);
	const signed = await (
		await a.fetch("https://api.identity.local/signed")
	).json();
	expect(signed.status).toBe("verified");
	expect(new URL(signed.identity.signatureAgent).hostname.split(".")[0]).toBe(
		await a.id
	);
});
it("gets an honest pinned absence from a locally provisioned app connector", async ({
	expect,
}) => {
	using account = await env.ACCOUNT.getIdentity("reporter");
	expect(await account.connectionId).toBeNull();
	expect((await account.getStatus()).state).toBe("consent_required");
	let rejected = false;
	try {
		await account.getToken();
	} catch {
		rejected = true;
	}
	expect(rejected).toBe(true);
});
