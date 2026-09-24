import { defineConfig } from "tsup";
import { EXTERNAL_DEPENDENCIES } from "./scripts/deps";

export default defineConfig(() => [
	{
		clean: true,
		treeshake: true,
		keepNames: true,
		entry: {
			index: "index.ts",
		},
		platform: "node",
		// Bundled ws uses CommonJS imports for Node builtins. Miniflare bundles
		// this package into CJS, where import.meta.url is unavailable.
		banner: {
			js: 'import { createRequire } from "node:module"; const require = createRequire(typeof __filename === "string" ? __filename : import.meta.url);',
		},
		format: "esm",
		dts: true,
		outDir: "dist",
		tsconfig: "tsconfig.json",
		metafile: true,
		sourcemap: process.env.SOURCEMAPS !== "false",
		external: [/^@cloudflare\//, ...EXTERNAL_DEPENDENCIES],
	},
]);
