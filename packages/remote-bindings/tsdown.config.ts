import path from "node:path";
import { defineConfig } from "tsdown";
import { emitDeclarations } from "../../tools/build/declarations.mjs";
import { embedWorkersPlugin } from "./scripts/embed-workers.ts";

export default defineConfig([
	{
		entry: {
			index: "src/index.ts",
		},
		platform: "node",
		inputOptions: { resolve: { mainFields: ["module", "main"] } },
		outDir: "dist",
		dts: false,
		tsconfig: "tsconfig.json",
		deps: {
			neverBundle: (id) => {
				const unprefixedId = id.charCodeAt(0) === 0 ? id.slice(1) : id;
				return (
					!unprefixedId.startsWith("worker:") &&
					!unprefixedId.startsWith(".") &&
					!path.isAbsolute(unprefixedId)
				);
			},
		},
		plugins: [embedWorkersPlugin()],
	},
	{
		entry: {
			index: "emitted-types/packages/remote-bindings/src/index.d.ts",
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
		deps: {
			neverBundle: (id) => {
				const unprefixedId = id.charCodeAt(0) === 0 ? id.slice(1) : id;
				return (
					!unprefixedId.startsWith("worker:") &&
					!unprefixedId.startsWith(".") &&
					!path.isAbsolute(unprefixedId)
				);
			},
		},
	},
]);
