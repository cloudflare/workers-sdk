import { defineBuildConfig } from "obuild/config";

export default defineBuildConfig({
	entries: ["src/runtime/:dist/runtime", "src/index.ts"],
});
