import { defineBuildConfig } from "unbuild";

export default defineBuildConfig({
	entries: [
		{ input: "src/", outDir: "dist/src", format: "esm", declaration: true },
	],
});
