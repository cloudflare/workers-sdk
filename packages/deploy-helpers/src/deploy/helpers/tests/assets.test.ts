import { describe, test } from "vitest";
import { resolveAssetOptions } from "../assets";
import type { Config } from "@cloudflare/workers-utils";

const assetsDir = {
	directory: "/tmp/assets",
	directoryExists: false,
};

describe("resolveAssetOptions", () => {
	test("preserves assets.base_path when constructing upload options", ({
		expect,
	}) => {
		const result = resolveAssetOptions({ assetsDir, main: undefined }, {
			assets: { directory: "./public", base_path: "./docs" },
		} as Config);

		expect(result?.assetConfig.base_path).toBe("./docs");
	});

	test("defers semantic validation to the Asset Worker", ({ expect }) => {
		const result = resolveAssetOptions({ assetsDir, main: undefined }, {
			assets: {
				directory: "./public",
				base_path: "https://example.com/docs",
			},
		} as Config);

		expect(result?.assetConfig.base_path).toBe("https://example.com/docs");
	});

	test("resolves date-enabled compatibility flags for upload", ({ expect }) => {
		const result = resolveAssetOptions({ assetsDir, main: undefined }, {
			compatibility_date: "2025-04-01",
			assets: { directory: "./public" },
		} as Config);

		expect(result?.assetConfig.compatibility_flags).toContain(
			"assets_navigation_prefers_asset_serving"
		);
	});
});
