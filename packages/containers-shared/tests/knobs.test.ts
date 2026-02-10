import { describe, it, vi } from "vitest";
import { getCloudflareContainerRegistry } from "./../src/knobs";

describe("getCloudflareContainerRegistry", () => {
	it("should return the managed registry", ({ expect }) => {
		expect(getCloudflareContainerRegistry()).toBe("registry.cloudflare.com");
		vi.stubEnv("WRANGLER_API_ENVIRONMENT", "production");
		expect(getCloudflareContainerRegistry()).toBe("registry.cloudflare.com");
	});

	it("should return the staging registry", ({ expect }) => {
		vi.stubEnv("WRANGLER_API_ENVIRONMENT", "staging");
		expect(getCloudflareContainerRegistry()).toBe(
			"staging.registry.cloudflare.com"
		);
	});
});
