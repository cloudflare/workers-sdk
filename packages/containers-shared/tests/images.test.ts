import { beforeEach, describe, it, vi } from "vitest";
import {
	getEgressInterceptorPlatform,
	pullEgressInterceptorImage,
} from "../src/images";
import { runDockerCmd } from "../src/utils";

vi.mock("../src/utils", () => ({
	runDockerCmd: vi.fn(() => ({
		abort: vi.fn(),
		ready: Promise.resolve({ aborted: false }),
		then: (resolve: () => void) => {
			resolve();
		},
	})),
}));

describe("getEgressInterceptorPlatform", () => {
	beforeEach(() => {
		vi.unstubAllEnvs();
	});

	it("does not force a platform by default", ({ expect }) => {
		expect(getEgressInterceptorPlatform()).toBeUndefined();
	});

	it("allows overriding the platform", ({ expect }) => {
		vi.stubEnv("MINIFLARE_CONTAINER_EGRESS_IMAGE_PLATFORM", "linux/s390x");

		expect(getEgressInterceptorPlatform()).toBe("linux/s390x");
	});
});

describe("pullEgressInterceptorImage", () => {
	beforeEach(() => {
		vi.unstubAllEnvs();
		vi.mocked(runDockerCmd).mockClear();
	});

	it("pulls the egress interceptor image without forcing a platform by default", async ({
		expect,
	}) => {
		vi.stubEnv("MINIFLARE_CONTAINER_EGRESS_IMAGE", "proxy-everything:test");

		await pullEgressInterceptorImage("docker");

		expect(runDockerCmd).toHaveBeenCalledWith("docker", [
			"pull",
			"proxy-everything:test",
		]);
	});

	it("pulls the egress interceptor image for the configured platform", async ({
		expect,
	}) => {
		vi.stubEnv("MINIFLARE_CONTAINER_EGRESS_IMAGE", "proxy-everything:test");
		vi.stubEnv("MINIFLARE_CONTAINER_EGRESS_IMAGE_PLATFORM", "linux/arm64");

		await pullEgressInterceptorImage("docker");

		expect(runDockerCmd).toHaveBeenCalledWith("docker", [
			"pull",
			"proxy-everything:test",
			"--platform",
			"linux/arm64",
		]);
	});
});
