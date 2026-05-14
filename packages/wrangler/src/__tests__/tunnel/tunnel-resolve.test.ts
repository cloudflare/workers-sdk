import { describe, it, vi } from "vitest";
import { createCloudflareClient } from "../../cfetch/internal";
import { resolveNamedTunnel, resolveTunnelId } from "../../tunnel/client";
import type Cloudflare from "cloudflare";

vi.mock("../../cfetch/internal");

describe("resolveTunnelId", () => {
	it("returns UUID input without calling API", async ({ expect }) => {
		const sdk = {
			zeroTrust: {
				tunnels: {
					cloudflared: {
						list() {
							throw new Error("should not be called");
						},
					},
				},
			},
		} as unknown as Cloudflare;

		await expect(
			resolveTunnelId(sdk, "account", "f70ff985-a4ef-4643-bbbc-4a0ed4fc8415")
		).resolves.toBe("f70ff985-a4ef-4643-bbbc-4a0ed4fc8415");
	});

	it("resolves a unique tunnel name via SDK list", async ({ expect }) => {
		const sdk = {
			zeroTrust: {
				tunnels: {
					cloudflared: {
						list({ name }: { name?: string }) {
							expect(name).toBe("my-tunnel");
							return [
								{
									id: "11111111-1111-4111-8111-111111111111",
									name: "my-tunnel",
								},
							];
						},
					},
				},
			},
		} as unknown as Cloudflare;

		await expect(resolveTunnelId(sdk, "account", "my-tunnel")).resolves.toBe(
			"11111111-1111-4111-8111-111111111111"
		);
	});

	it("resolves a named tunnel target from matching ingress rules", async ({
		expect,
	}) => {
		vi.mocked(createCloudflareClient).mockReturnValue({
			zeroTrust: {
				tunnels: {
					cloudflared: {
						// @ts-expect-error -- partial mock
						list({ name }: { name?: string }) {
							expect(name).toBe("my-tunnel");
							return [
								{
									id: "11111111-1111-4111-8111-111111111111",
									name: "my-tunnel",
								},
							];
						},
						configurations: {
							// @ts-expect-error -- partial mock
							get(tunnelId: string) {
								expect(tunnelId).toBe("11111111-1111-4111-8111-111111111111");
								return Promise.resolve({
									config: {
										ingress: [
											{
												hostname: "dev.example.com",
												service: "http://localhost:8787",
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
							// @ts-expect-error -- partial mock
							get(tunnelId: string) {
								expect(tunnelId).toBe("11111111-1111-4111-8111-111111111111");
								return Promise.resolve("TOKEN");
							},
						},
					},
				},
			},
		});

		await expect(
			resolveNamedTunnel("my-tunnel", new URL("http://localhost:8787"), {
				accountId: "account",
				complianceRegion: undefined,
			})
		).resolves.toEqual({
			hostnames: ["dev.example.com"],
			token: "TOKEN",
		});
	});

	it("throws when a named tunnel has no ingress for the local port", async ({
		expect,
	}) => {
		vi.mocked(createCloudflareClient).mockReturnValue({
			zeroTrust: {
				tunnels: {
					cloudflared: {
						// @ts-expect-error -- partial mock
						list() {
							return [
								{
									id: "test-tunnel-id",
									name: "my-tunnel",
								},
							];
						},
						configurations: {
							// @ts-expect-error -- partial mock
							get() {
								return Promise.resolve({
									config: {
										ingress: [
											{
												hostname: "dev.example.com",
												service: "http://localhost:3000",
											},
											{
												hostname: "admin.example.com",
												service: "http://localhost:4000",
											},
										],
									},
								});
							},
						},
						// @ts-expect-error -- partial mock
						token: {
							get() {
								throw new Error("should not be called");
							},
						},
					},
				},
			},
		});

		await expect(
			resolveNamedTunnel("my-tunnel", new URL("http://localhost:8787"), {
				accountId: "test-account-id",
				complianceRegion: undefined,
			})
		).rejects.toThrowErrorMatchingInlineSnapshot(`
			[Error: Tunnel "my-tunnel" has no route for http://localhost:8787/

			Resolved routes:
			  - dev.example.com -> http://localhost:3000
			  - admin.example.com -> http://localhost:4000

			Update your local server settings or the tunnel routes in the Cloudflare dashboard:
			https://dash.cloudflare.com/test-account-id/tunnels/test-tunnel-id
			]
		`);
	});

	it("shows compact setup guidance when a named tunnel has no ingress rules", async ({
		expect,
	}) => {
		vi.mocked(createCloudflareClient).mockReturnValue({
			zeroTrust: {
				tunnels: {
					cloudflared: {
						// @ts-expect-error -- partial mock
						list() {
							return [
								{
									id: "test-tunnel-id",
									name: "my-tunnel",
								},
							];
						},
						configurations: {
							// @ts-expect-error -- partial mock
							get() {
								return Promise.resolve({ config: { ingress: [] } });
							},
						},
						// @ts-expect-error -- partial mock
						token: {
							get() {
								throw new Error("should not be called");
							},
						},
					},
				},
			},
		});

		await expect(
			resolveNamedTunnel("my-tunnel", new URL("http://localhost:8787"), {
				accountId: "test-account-id",
				complianceRegion: undefined,
			})
		).rejects.toThrowErrorMatchingInlineSnapshot(`
			[Error: Tunnel "my-tunnel" has no routes configured.

			Add a route for http://localhost:8787/ in the Cloudflare dashboard:
			https://dash.cloudflare.com/test-account-id/tunnels/test-tunnel-id
			]
		`);
	});
});
