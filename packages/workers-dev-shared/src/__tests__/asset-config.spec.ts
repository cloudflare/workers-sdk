import { test } from "vitest";
import { getAssetsConfig } from "../asset-config";
import type { AssetsOnlyResolvedConfig } from "../plugin-config";

test("maps the native asset base path to the Asset Worker config", ({
	expect,
}) => {
	const resolvedPluginConfig = {
		type: "assets-only",
		config: { assets: { basePath: "/docs" } },
		experimental: {},
	} as unknown as AssetsOnlyResolvedConfig;

	expect(
		getAssetsConfig(resolvedPluginConfig, undefined, {
			publicDir: "public",
			logger: console,
		})
	).toEqual({
		base_path: "/docs",
		has_static_routing: false,
	});
});
