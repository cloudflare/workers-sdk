import { describe, it } from "vitest";
import {
	resolveNamedTunnel,
	resolveTunnelId,
} from "../../tunnel/client";
import type Cloudflare from "cloudflare";

function asyncIterableFromArray<T>(items: T[]): AsyncIterable<T> {
	return {
		async *[Symbol.asyncIterator]() {
			for (const item of items) {
				yield item;
			}
		},
	};
}

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
							return asyncIterableFromArray([
								{
									id: "11111111-1111-4111-8111-111111111111",
									name: "my-tunnel",
								},
							]);
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
		const sdk = {
			zeroTrust: {
				tunnels: {
					cloudflared: {
						list({ name }: { name?: string }) {
							expect(name).toBe("my-tunnel");
							return asyncIterableFromArray([
								{
									id: "11111111-1111-4111-8111-111111111111",
									name: "my-tunnel",
								},
							]);
						},
						configurations: {
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
							get(tunnelId: string) {
								expect(tunnelId).toBe("11111111-1111-4111-8111-111111111111");
								return Promise.resolve("TOKEN");
							},
						},
					},
				},
			},
		} as unknown as Cloudflare;

		await expect(
			resolveNamedTunnel(
				sdk,
				"account",
				"my-tunnel",
				new URL("http://localhost:8787")
			)
		).resolves.toEqual({
			hostnames: ["dev.example.com"],
			token: "TOKEN",
		});
	});

	it("throws when a named tunnel has no ingress for the local port", async ({
		expect,
	}) => {
		const sdk = {
			zeroTrust: {
				tunnels: {
					cloudflared: {
						list() {
							return asyncIterableFromArray([
								{
									id: "11111111-1111-4111-8111-111111111111",
									name: "my-tunnel",
								},
							]);
						},
						configurations: {
							get() {
								return Promise.resolve({
									config: {
										ingress: [
											{
												hostname: "dev.example.com",
												service: "http://localhost:3000",
											},
										],
									},
								});
							},
						},
						token: {
							get() {
								throw new Error("should not be called");
							},
						},
					},
				},
			},
		} as unknown as Cloudflare;

		await expect(
			resolveNamedTunnel(
				sdk,
				"account",
				"my-tunnel",
				new URL("http://localhost:8787")
			)
		).rejects.toThrow(
			'No ingress rules in tunnel "my-tunnel" route to local port 8787.'
		);
	});
});
