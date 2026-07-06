import { defineConfig } from "tsup";

// Recreates the CommonJS globals (`require`, `__filename`, `__dirname`) that
// esbuild otherwise leaves undefined in ESM output when it inlines CJS
// dependencies (which reference `__filename` via `createRequire`). Without this
// the output throws "__filename is not defined" / "Dynamic require of ... is
// not supported" in a pure-ESM context (e.g. when this package is imported by
// the Vite plugin at dev-server startup). Each initializer is self-contained so
// that, if tree-shaking drops an unused binding, the leftover side-effect
// expression can never reference a dropped variable.
const CJS_SHIM_BANNER = [
	'import { createRequire as __wsdkCreateRequire } from "node:module";',
	'import { fileURLToPath as __wsdkFileURLToPath } from "node:url";',
	'import { dirname as __wsdkDirname } from "node:path";',
	"var require = __wsdkCreateRequire(import.meta.url);",
	"var __filename = __wsdkFileURLToPath(import.meta.url);",
	"var __dirname = __wsdkDirname(__wsdkFileURLToPath(import.meta.url));",
].join("\n");

export default defineConfig(() => [
	{
		treeshake: true,
		keepNames: true,
		entry: ["src/index.ts", "src/test-helpers/index.ts"],
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
		external: ["@cloudflare/*", "vitest", "undici", "msw"],
		banner: { js: CJS_SHIM_BANNER },
	},
]);
