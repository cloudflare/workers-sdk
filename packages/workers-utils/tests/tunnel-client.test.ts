import { describe, it } from "vitest";
import { resolveNamedTunnel } from "../src/tunnel-client";
import type Cloudflare from "cloudflare";

function createClient(): Cloudflare {
	return {
		zeroTrust: {
			tunnels: {
				cloudflared: {
					list() {
						return [
							{
								id: "11111111-1111-4111-8111-111111111111",
								name: "my-tunnel",
							},
						];
					},
					configurations: {
						get() {
							return Promise.resolve({
								config: {
									ingress: [
										{
											hostname: "dev.example.com",
											service: "http://127.0.0.1:8787",
										},
										{
											hostname: "other.example.com",
											service: "http://localhost:3000",
										},
									],
								},
							});
						},
					},
					token: {
						get() {
							return Promise.resolve("TOKEN");
						},
					},
				},
			},
		},
	} as unknown as Cloudflare;
}

describe("resolveNamedTunnel", () => {
	it("resolves matching ingress hostnames and the tunnel token", async ({
		expect,
	}) => {
		await expect(
			resolveNamedTunnel("my-tunnel", new URL("http://localhost:8787"), {
				sdk: createClient(),
				accountId: "account",
			})
		).resolves.toEqual({
			hostnames: ["dev.example.com"],
			token: "TOKEN",
		});
	});
});
