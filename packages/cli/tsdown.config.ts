import { defineConfig } from "tsdown";
import { emitDeclarations } from "../../tools/build/declarations.mjs";

export default defineConfig([
	{
		entry: [
			"index.ts",
			"args.ts",
			"colors.ts",
			"command.ts",
			"error.ts",
			"gitignore.ts",
			"interactive.ts",
			"packages.ts",
			"streams.ts",
		],
		platform: "node",
		inputOptions: { resolve: { mainFields: ["module", "main"] } },
		format: "esm",
		dts: false,
		outDir: "dist",
		tsconfig: "tsconfig.json",
		sourcemap: process.env.SOURCEMAPS !== "false",
		// Transpile each source file individually without bundling dependencies.
		// This package is always consumed through a downstream bundler (C3,
		// wrangler, miniflare) which handles dependency resolution itself.
		// Bundling CJS deps into ESM creates createRequire(import.meta.url) shims
		// that break when re-bundled as CJS.
		unbundle: true,
	},
	{
		entry: {
			index: "emitted-types/packages/cli/index.d.ts",
			args: "emitted-types/packages/cli/args.d.ts",
			colors: "emitted-types/packages/cli/colors.d.ts",
			command: "emitted-types/packages/cli/command.d.ts",
			error: "emitted-types/packages/cli/error.d.ts",
			gitignore: "emitted-types/packages/cli/gitignore.d.ts",
			interactive: "emitted-types/packages/cli/interactive.d.ts",
			packages: "emitted-types/packages/cli/packages.d.ts",
			streams: "emitted-types/packages/cli/streams.d.ts",
		},
		platform: "node",
		format: "esm",
		outDir: "dist",
		clean: false,
		dts: {
			dtsInput: true,
			emitDtsOnly: true,
			sourcemap: process.env.SOURCEMAPS !== "false",
		},
		outputOptions: {
			entryFileNames: "[name].d.mts",
			chunkFileNames: "[name]-[hash].d.mts",
		},
		tsconfig: "tsconfig.declarations.json",
		sourcemap: process.env.SOURCEMAPS !== "false",
		plugins: [emitDeclarations()],
	},
]);
