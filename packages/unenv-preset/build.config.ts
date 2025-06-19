import { defineBuildConfig } from "unbuild";

export default defineBuildConfig({
	declaration: true,
	rollup: {
		cjsBridge: true,
	},
	entries: [
		"src/index",
		{ input: "src/runtime/", outDir: "dist/runtime", format: "esm" },
	],
});
