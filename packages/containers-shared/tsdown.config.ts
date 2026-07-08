import { defineConfig } from "tsdown";

export default defineConfig({
	entry: [
		"index.ts",
		// Deep entry points preserved for existing subpath imports from Wrangler
		// and the Vite plugin. These map to the `./src/*` keys in `exports`.
		"src/knobs.ts",
		"src/utils.ts",
		"src/client/core/request.ts",
		"src/client/models/ApplicationAffinityHardwareGeneration.ts",
	],
	platform: "node",
	format: ["esm"],
	dts: true,
	outDir: "dist",
	tsconfig: "tsconfig.json",
	sourcemap: process.env.SOURCEMAPS !== "false",
	// `@cloudflare/workers-utils` is a built workspace package with its own entry
	// points, so keep it external rather than duplicating it into this bundle.
	// Consumers that bundle containers-shared resolve it themselves.
	external: ["@cloudflare/workers-utils"],
});
