import { afterEach, describe, it, vi } from "vitest";
import { OpenAPI } from "../src/client/core/OpenAPI";
import { request } from "../src/client/core/request";

describe("request", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		OpenAPI.BASE = "";
	});

	it("preserves raw error responses parsed from text", async ({ expect }) => {
		OpenAPI.BASE =
			"https://api.cloudflare.com/client/v4/accounts/account-id/containers";
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				return new Response(JSON.stringify({ error: "INVALID_INSTANCE_ID" }), {
					status: 400,
					headers: { "Content-Type": "text/plain" },
				});
			})
		);

		await expect(
			request(OpenAPI, {
				method: "GET",
				url: "/instances/invalid-id/ssh",
				errors: { 400: "Bad Request" },
			})
		).rejects.toMatchObject({
			body: { error: "INVALID_INSTANCE_ID" },
		});
	});
});
