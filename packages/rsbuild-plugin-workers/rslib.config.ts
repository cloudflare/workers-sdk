import { defineConfig } from "@rslib/core";

export default defineConfig({
	lib: [
		{
			format: "esm",
			dts: {
				bundle: true,
			},
			source: {
				entry: {
					index: "./src/index.ts",
				},
				tsconfigPath: "./tsconfig.json",
			},
			autoExternal: {
				dependencies: true,
				optionalDependencies: true,
				peerDependencies: true,
				devDependencies: false,
			},
		},
	],
	output: {
		target: "node",
		distPath: {
			root: "./dist",
		},
	},
});
