import { afterEach, describe, it } from "vitest";
import { OpenAPI } from "../src/client/core/OpenAPI";
import { configureOpenAPIForContainerPull } from "../src/login";

describe("configureOpenAPIForContainerPull", () => {
	afterEach(() => {
		OpenAPI.BASE = "";
		OpenAPI.HEADERS = undefined;
		OpenAPI.CREDENTIALS = "include";
	});

	it("sets BASE, HEADERS, and CREDENTIALS", ({ expect }) => {
		configureOpenAPIForContainerPull("abc123", "my-token");
		expect(OpenAPI.BASE).toBe(
			"https://api.cloudflare.com/client/v4/accounts/abc123/containers"
		);
		expect(OpenAPI.CREDENTIALS).toBe("omit");
		expect((OpenAPI.HEADERS as Record<string, string>)["Authorization"]).toBe(
			"Bearer my-token"
		);
	});

	it("uses custom apiBase when provided", ({ expect }) => {
		configureOpenAPIForContainerPull(
			"abc123",
			"my-token",
			"https://staging.cloudflare.com/client/v4"
		);
		expect(OpenAPI.BASE).toBe(
			"https://staging.cloudflare.com/client/v4/accounts/abc123/containers"
		);
	});
});
