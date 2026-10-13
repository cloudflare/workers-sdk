import { afterEach, describe, it, vi } from "vitest";
import {
	CLI_DISPLAY_NAME_ENV_VAR,
	getCliDisplayName,
	isPreviewBuild,
	PREVIEW_BUILD_ENV_VAR,
} from "../build-output-env";

describe("getCliDisplayName", () => {
	afterEach(() => vi.unstubAllEnvs());

	it("defaults to Wrangler", ({ expect }) => {
		vi.stubEnv(CLI_DISPLAY_NAME_ENV_VAR, undefined);

		expect(getCliDisplayName()).toBe("Wrangler");
	});

	it("uses the caller set by cf-vite", ({ expect }) => {
		vi.stubEnv(CLI_DISPLAY_NAME_ENV_VAR, "cf");

		expect(getCliDisplayName()).toBe("cf");
	});
});

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
