import { afterEach, describe, expect, it, vi } from "vitest";
import { getCloudflareContainerRegistry } from "./../src/knobs";

describe("getCloudflareContainerRegistry", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});
	it("should return the managed registry", () => {
		expect(getCloudflareContainerRegistry()).toBe("registry.cloudflare.com");
		vi.stubEnv("WRANGLER_API_ENVIRONMENT", "production");
		expect(getCloudflareContainerRegistry()).toBe("registry.cloudflare.com");
	});

	it("should return the staging registry", () => {
		vi.stubEnv("WRANGLER_API_ENVIRONMENT", "staging");
		expect(getCloudflareContainerRegistry()).toBe(
			"staging.registry.cloudflare.com"
		);
	});

	it("should return the fedramp_high registry", () => {
		vi.stubEnv("CLOUDFLARE_COMPLIANCE_REGION", "fedramp_high");
		expect(getCloudflareContainerRegistry()).toBe(
			"registry.fed.cloudflare.com"
		);
	});

	it("should return the staging fedramp_high registry", () => {
		vi.stubEnv("WRANGLER_API_ENVIRONMENT", "staging");
		vi.stubEnv("CLOUDFLARE_COMPLIANCE_REGION", "fedramp_high");
		expect(getCloudflareContainerRegistry()).toBe(
			"staging.registry.fed.cloudflare.com"
		);
	});

	it("should allow override via CLOUDFLARE_CONTAINER_REGISTRY", () => {
		vi.stubEnv("CLOUDFLARE_CONTAINER_REGISTRY", "custom.registry.example.com");
		expect(getCloudflareContainerRegistry()).toBe(
			"custom.registry.example.com"
		);
	});
});
