import { defineConfig } from "tsup";
import type { Options } from "tsup";

const shared = {
	treeshake: true,
	keepNames: true,
	platform: "node",
	format: "esm",
	dts: true,
	outDir: "dist",
	tsconfig: "tsconfig.json",
	metafile: true,
	sourcemap: process.env.SOURCEMAPS !== "false",
	define: {
		"process.env.NODE_ENV": `'${"production"}'`,
	},
	external: ["@cloudflare/*", "vitest", "undici"],
} satisfies Options;

export default defineConfig(() => [
	{
		...shared,
		entry: [
			"src/index.ts",
			"src/prometheus-metrics.ts",
			"src/test-helpers/index.ts",
		],
		// esbuild bundles several CJS-only transitive deps (e.g. `xdg-app-paths`)
		// into the ESM output and injects a `__require` helper to back their
		// `require(...)` calls. That helper throws under pure ESM (there is no
		// global `require`). Define one via `createRequire` so the bundled CJS
		// modules resolve correctly at runtime. This bakes in the fix that
		// downstream consumers previously had to apply via a pnpm patch.
		//
		// NOTE: deliberately NOT applied to the `browser` entry below — it must
		// not statically import `node:module`, which is unavailable in browsers.
		banner: {
			js: 'import { createRequire as __cfCreateRequire } from "node:module";\nif (typeof globalThis.require === "undefined") { globalThis.require = __cfCreateRequire(import.meta.url); }',
		},
	},
	{
		...shared,
		entry: ["src/browser.ts"],
	},
]);
