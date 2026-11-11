import { afterEach, describe, it, vi } from "vitest";
import {
	getCloudflareContainerRegistry,
	getContainerImageRegistryConfigs,
	isCloudflareContainerRegistry,
} from "./../src/knobs";

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
		expect(getCloudflareContainerRegistry({ jurisdiction: "fedramp" })).toBe(
			"registry.example.com"
		);
	});

	it("should return the FedRAMP Moderate registry for fedramp images", ({
		expect,
	}) => {
		expect(getCloudflareContainerRegistry({ jurisdiction: "fedramp" })).toBe(
			"frm.registry.cloudflare.com"
		);
		expect(
			getCloudflareContainerRegistry({
				compliance_region: "public",
				jurisdiction: "fedramp",
			})
		).toBe("frm.registry.cloudflare.com");
		vi.stubEnv("WRANGLER_API_ENVIRONMENT", "staging");
		expect(getCloudflareContainerRegistry({ jurisdiction: "fedramp" })).toBe(
			"staging.frm.registry.cloudflare.com"
		);
	});

	it("should keep the FedRAMP High registry for fedramp images", ({
		expect,
	}) => {
		expect(
			getCloudflareContainerRegistry({
				compliance_region: "fedramp_high",
				jurisdiction: "fedramp",
			})
		).toBe("registry.fed.cloudflare.com");
	});
});

describe("getContainerImageRegistryConfigs", () => {
	it("should select one registry per jurisdiction", ({ expect }) => {
		expect(
			getContainerImageRegistryConfigs({ compliance_region: "public" }, [
				"fedramp",
			])
		).toEqual([{ compliance_region: "public", jurisdiction: "fedramp" }]);
	});

	it.for([undefined, []])(
		"should select the default registry without jurisdictions: %j",
		(jurisdictions, { expect }) => {
			expect(getContainerImageRegistryConfigs({}, jurisdictions)).toEqual([
				{ compliance_region: undefined },
			]);
		}
	);
});

describe("isCloudflareContainerRegistry", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("should recognise the managed and FedRAMP Moderate registries", ({
		expect,
	}) => {
		expect(isCloudflareContainerRegistry("registry.cloudflare.com")).toBe(true);
		expect(isCloudflareContainerRegistry("frm.registry.cloudflare.com")).toBe(
			true
		);
		expect(isCloudflareContainerRegistry("docker.io")).toBe(false);
		expect(
			isCloudflareContainerRegistry("frm.registry.cloudflare.com", {
				compliance_region: "fedramp_high",
			})
		).toBe(false);
	});
});
