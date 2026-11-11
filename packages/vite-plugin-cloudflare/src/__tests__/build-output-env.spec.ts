import { afterEach, describe, it, vi } from "vitest";
import { isPreviewBuild, PREVIEW_BUILD_ENV_VAR } from "../build-output-env";

describe("isPreviewBuild", () => {
	afterEach(() => vi.unstubAllEnvs());

	it("uses the shared Preview build environment variable", ({ expect }) => {
		expect(PREVIEW_BUILD_ENV_VAR).toBe("CLOUDFLARE_PREVIEW_BUILD");
		vi.stubEnv(PREVIEW_BUILD_ENV_VAR, "true");

		expect(isPreviewBuild()).toBe(true);
	});

	it("is false for non-Preview builds", ({ expect }) => {
		vi.stubEnv(PREVIEW_BUILD_ENV_VAR, "false");

		expect(isPreviewBuild()).toBe(false);
	});
});
