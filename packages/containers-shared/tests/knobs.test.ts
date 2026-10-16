import { afterEach, describe, it, vi } from "vitest";
import { getCloudflareContainerRegistry } from "./../src/knobs";

describe("getCloudflareContainerRegistry", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

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

	it("should return the FedRAMP High registry from the environment", ({
		expect,
	}) => {
		vi.stubEnv("CLOUDFLARE_COMPLIANCE_REGION", "fedramp_high");
		expect(getCloudflareContainerRegistry()).toBe(
			"registry.fed.cloudflare.com"
		);
	});

	it("should return the FedRAMP High registry from Wrangler config", ({
		expect,
	}) => {
		expect(
			getCloudflareContainerRegistry({ compliance_region: "fedramp_high" })
		).toBe("registry.fed.cloudflare.com");
	});

	it("should return the staging FedRAMP High registry", ({ expect }) => {
		vi.stubEnv("WRANGLER_API_ENVIRONMENT", "staging");
		expect(
			getCloudflareContainerRegistry({ compliance_region: "fedramp_high" })
		).toBe("staging.registry.fed.cloudflare.com");
	});

	it("should allow an explicit registry override", ({ expect }) => {
		vi.stubEnv("CLOUDFLARE_CONTAINER_REGISTRY", "registry.example.com");
		vi.stubEnv("WRANGLER_API_ENVIRONMENT", "staging");
		vi.stubEnv("CLOUDFLARE_COMPLIANCE_REGION", "fedramp_high");
		expect(
			getCloudflareContainerRegistry({ compliance_region: "public" })
		).toBe("registry.example.com");
	});
});
