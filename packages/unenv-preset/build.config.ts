import { defineBuildConfig } from "unbuild";

export default defineBuildConfig({
	declaration: true,
	entries: [{ input: "src/", outDir: "dist/", format: "esm" }],
});
