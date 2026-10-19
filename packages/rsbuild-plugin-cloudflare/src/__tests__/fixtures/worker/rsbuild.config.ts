import { pluginCloudflare } from "@cloudflare/rsbuild-plugin";
import { defineConfig } from "@rsbuild/core";

export default defineConfig({
	plugins: [pluginCloudflare({ types: { includeRuntime: false } })],
});
