import { defineBuildConfig } from "unbuild";

export default defineBuildConfig({
	declaration: true,
	rollup: {
		cjsBridge: true,
		inlineDependencies: true,
		resolve: {
			exportConditions: ["workerd"],
		},
	},
	externals: [/^cloudflare:/],
	entries: [
		"src/index",
		// Use rollup for debug file to inline the dependency
		"src/runtime/npm/debug",
		// Use mkdist for the rest to preserve structure
		{
			input: "src/runtime/",
			outDir: "dist/runtime",
			format: "esm",
			pattern: ["**", "!npm/debug.ts"],
		},
	],
});
