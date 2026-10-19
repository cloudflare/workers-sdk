import { pluginCloudflare } from "@cloudflare/rsbuild-plugin";
import { defineConfig } from "@rsbuild/core";

export default defineConfig({
	source: { entry: { index: "./src/index.ts" } },
	plugins: [pluginCloudflare({ types: { includeRuntime: false } })],
});
