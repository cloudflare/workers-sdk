import { defineConfig } from "tsdown";

export default defineConfig({
	entry: { "local-binding-worker": "src/local-binding-worker.ts" },
	format: "esm",
	dts: false,
	sourcemap: true,
	deps: { neverBundle: [/^cloudflare:/], alwaysBundle: [/.*/] },
});
