import { defineConfig } from "tsdown";

export default defineConfig({
	entry: [
		"src/index.ts",
		"src/browser.ts",
		"src/prometheus-metrics.ts",
		"src/test-helpers/index.ts",
		// Leaf entry points that only depend on Node.js builtins, so they can
		// be imported by packages bundling to ESM (e.g. via Vite) without
		// pulling in the barrel's CommonJS dependencies.
		"src/fs-helpers.ts",
		"src/global-wrangler-config-path.ts",
	],
	platform: "node",
	format: ["esm"],
	dts: true,
	outDir: "dist",
	tsconfig: "tsconfig.json",
	// Prefer the `module` (ESM) entry over `main` when resolving dependencies.
	// Some deps (e.g. `jsonc-parser`) ship a UMD `main` that uses AMD-style
	// dynamic `require("./impl/...")` calls which cannot be statically bundled,
	// but also ship a clean ESM `module` build. Rolldown defaults to `main`-first
	// on the node platform, so opt into `module`-first (standard bundler
	// behaviour) to bundle the analysable ESM sources instead.
	inputOptions: {
		resolve: {
			mainFields: ["module", "main"],
		},
	},
	sourcemap: process.env.SOURCEMAPS !== "false",
	define: {
		"process.env.NODE_ENV": `'${"production"}'`,
	},
	// Enable `__dirname`/`__filename` shims so inlined CommonJS dependencies
	// (e.g. `command-exists`, the `update-check` tree) work in the ESM output.
	// The `require` shim is auto-injected for node ESM output. All shims are
	// tree-shaken when unused, so pure leaf entries — and Worker bundles that
	// consume this package — are unaffected.
	shims: true,
	// Rely on tsdown defaults for `@cloudflare/*`: `dependencies` are externalized
	// and `devDependencies` are bundled. The workspace deps used here
	// (`@cloudflare/workers-shared`, `@cloudflare/workflows-shared`) are
	// devDependencies with no `exports`/`main`, so they are imported via deep
	// `.ts` source paths and MUST be bundled to be loadable as pure ESM at
	// runtime. `vitest` is a devDependency used by the `test-helpers` entry, so
	// keep it external; `undici` is already external as a runtime dependency.
	external: ["vitest", "undici"],
});
