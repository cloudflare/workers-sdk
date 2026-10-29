import path from "node:path";
import { loadAndParseConfig } from "@cloudflare/config";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { describe, it, vi } from "vitest";
import { getPlatformProxy } from "../index";
import type { LoadAndParseConfigResult } from "@cloudflare/config";

// Vitest intercepts the module hooks `loadConfig` relies on, so the loader is mocked here
vi.mock("@cloudflare/config", () => ({ loadAndParseConfig: vi.fn() }));

describe("getPlatformProxy()", () => {
	runInTempDir();

	it("loads cloudflare.config.ts from the current directory in development mode", async ({
		expect,
	}) => {
		vi.mocked(loadAndParseConfig).mockResolvedValue({
			result: {
				success: true,
				data: {
					worker: {
						name: "my-worker",
						compatibilityDate: "2026-10-01",
						env: { GREETING: { type: "text", value: "hello" } },
					},
				},
			},
			dependencies: [],
		} as unknown as LoadAndParseConfigResult);

		const { env, dispose } = await getPlatformProxy<{ GREETING: string }>();

		try {
			expect(loadAndParseConfig).toHaveBeenCalledWith(
				path.resolve("cloudflare.config.ts"),
				{ isPreview: false, mode: "development" }
			);
			expect(env.GREETING).toBe("hello");
		} finally {
			await dispose();
		}
	});

	it("requires cloudflare.config.ts to define a Worker", async ({ expect }) => {
		vi.mocked(loadAndParseConfig).mockResolvedValue({
			result: { success: true, data: {} },
			dependencies: [],
		} as unknown as LoadAndParseConfigResult);

		await expect(getPlatformProxy()).rejects.toThrow(
			"`cloudflare.config.ts` must define a Worker using the `worker` property."
		);
	});
});
