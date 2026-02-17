import { describe, it } from "vitest";
import { resolveTunnelId } from "../tunnel/client";
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
});
