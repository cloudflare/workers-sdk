import { defineBuildConfig } from "unbuild";

export default defineBuildConfig({
	declaration: true,
	entries: [
		"src/index",
		{ input: "src/runtime/", outDir: "runtime", format: "esm" },
	],
});
