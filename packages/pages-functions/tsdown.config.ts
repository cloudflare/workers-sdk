import { defineConfig } from "tsdown";

export default defineConfig([
	{
		entry: { index: "src/index.ts" },
		platform: "node",
		format: "esm",
		outDir: "dist",
		dts: true,
		tsconfig: "tsconfig.json",
		sourcemap: process.env.SOURCEMAPS !== "false",
		// esbuild is invoked at runtime to compile user code; it ships
		// platform-specific binaries and must be resolved from the consumer's
		// node_modules at install time — not inlined into our bundle.
		external: ["esbuild"],
	},
	{
		entry: { cli: "src/cli.ts" },
		platform: "node",
		format: "esm",
		outDir: "dist",
		dts: false,
		tsconfig: "tsconfig.json",
		sourcemap: process.env.SOURCEMAPS !== "false",
		external: ["esbuild"],
	},
]);
