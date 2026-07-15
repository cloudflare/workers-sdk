import { describe, it, vi } from "vitest";
import {
	FUSE_CONTAINER_PRIVILEGES,
	getCloudflareContainerRegistry,
} from "./../src/knobs";

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

describe("FUSE_CONTAINER_PRIVILEGES", () => {
	it("contains the Docker privileges needed for FUSE", ({ expect }) => {
		expect(FUSE_CONTAINER_PRIVILEGES).toEqual({
			capabilities: ["SYS_ADMIN"],
			devices: [
				{
					pathOnHost: "/dev/fuse",
					pathInContainer: "/dev/fuse",
					cgroupPermissions: "rwm",
				},
			],
			securityOpt: ["apparmor:unconfined"],
		});
	});
});
