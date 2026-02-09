import { describe, expect, it } from "vitest";
import { decodeTunnelTokenToCredentialsFile } from "../tunnel/credentials";

describe("tunnel token credentials decoding", () => {
	it("decodes cloudflared-style tunnel token into credentials file shape", () => {
		const payload = {
			a: "account-tag",
			s: "base64-secret",
			t: "f70ff985-a4ef-4643-bbbc-4a0ed4fc8415",
			e: "https://example.com",
		};
		const token = Buffer.from(JSON.stringify(payload), "utf8").toString("base64");

		expect(decodeTunnelTokenToCredentialsFile(token)).toEqual({
			AccountTag: "account-tag",
			TunnelSecret: "base64-secret",
			TunnelID: "f70ff985-a4ef-4643-bbbc-4a0ed4fc8415",
			Endpoint: "https://example.com",
		});
	});

	it("throws on invalid token", () => {
		expect(() => decodeTunnelTokenToCredentialsFile("not-base64")).toThrow();
	});
});
