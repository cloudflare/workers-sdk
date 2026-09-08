import {
	APIError,
	resolveNamedTunnel as resolveNamedTunnelWithCredentials,
} from "@cloudflare/workers-utils";
import { describe, it, vi } from "vitest";
import { resolveNamedTunnel, resolveTunnelId } from "../../tunnel/client";
import * as user from "../../user";
import { mockApiToken } from "../helpers/mock-account-id";
import type Cloudflare from "cloudflare";

vi.mock("@cloudflare/workers-utils", async (importOriginal) => ({
	...(await importOriginal<typeof import("@cloudflare/workers-utils")>()),
	resolveNamedTunnel: vi.fn(),
}));

describe("resolveTunnelId", () => {
	mockApiToken();

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
		const requireAuthSpy = vi.spyOn(user, "requireAuth");
		vi.mocked(resolveNamedTunnelWithCredentials).mockResolvedValue({
			hostnames: ["dev.example.com"],
			token: "TOKEN",
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
		expect(requireAuthSpy).toHaveBeenCalledWith({
			account_id: "account",
			compliance_region: undefined,
		});
		expect(resolveNamedTunnelWithCredentials).toHaveBeenCalledWith(
			"my-tunnel",
			expect.any(URL),
			{
				accountId: "account",
				apiToken: { apiToken: "some-api-token" },
				complianceRegion: undefined,
				logger: expect.any(Object),
				userAgent: expect.stringMatching(/^wrangler\//),
			}
		);
	});

	it("shows API token guidance for named tunnel permission errors", async ({
		expect,
	}) => {
		for (const status of [401, 403]) {
			vi.mocked(resolveNamedTunnelWithCredentials).mockRejectedValueOnce(
				new APIError({
					text: "A request to the Cloudflare API failed.",
					telemetryMessage: "test tunnel api error",
					status,
				})
			);

			await expect(
				resolveNamedTunnel("my-tunnel", new URL("http://localhost:8787"), {
					accountId: "account",
					complianceRegion: undefined,
				})
			).rejects.toThrow(
				"Cloudflare Tunnel commands require API token authentication with tunnel permissions."
			);
		}
	});
});
