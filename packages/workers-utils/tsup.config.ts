import { defineConfig, type Options } from "tsup";

// Recreates the CommonJS globals (`require`, `__filename`, `__dirname`) that
// esbuild otherwise leaves undefined in ESM output when it inlines CJS
// dependencies. Each initializer is self-contained so that, if tree-shaking
// drops an unused binding, the leftover side-effect expression can never
// reference a dropped variable.
const CJS_SHIM_BANNER = [
	'import { createRequire as __wsdkCreateRequire } from "node:module";',
	'import { fileURLToPath as __wsdkFileURLToPath } from "node:url";',
	'import { dirname as __wsdkDirname } from "node:path";',
	"var require = __wsdkCreateRequire(import.meta.url);",
	"var __filename = __wsdkFileURLToPath(import.meta.url);",
	"var __dirname = __wsdkDirname(__wsdkFileURLToPath(import.meta.url));",
].join("\n");

const shared: Options = {
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
};

export default defineConfig(() => [
	{
		...shared,
		entry: [
			"src/index.ts",
			"src/prometheus-metrics.ts",
			"src/test-helpers/index.ts",
			// Leaf entry points that only depend on Node.js builtins, so they can
			// be imported by packages bundling to ESM (e.g. via Vite) without
			// pulling in the barrel's CommonJS dependencies.
			"src/fs-helpers.ts",
			"src/global-wrangler-config-path.ts",
		],
		// Bundled CommonJS dependencies (e.g. `signal-exit`) reference
		// `require`/`__filename`/`__dirname`. esbuild leaves those as-is (or as
		// a `__require` shim that throws "Dynamic require of ... is not
		// supported") in the ESM output, which breaks in a pure-ESM context
		// (e.g. when the barrel is imported by the Vite plugin at dev-server
		// startup). This banner re-creates the CommonJS globals. Excluded from
		// the browser build below, which has no such dependency and must not
		// import `node:module`.
		banner: { js: CJS_SHIM_BANNER },
	},
	{
		...shared,
		entry: ["src/browser.ts"],
	},
]);
