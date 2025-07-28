import { defineConfig } from "tsup";

export default defineConfig({
	clean: true,
	entry: ["index.mjs"],
	format: "esm",
});
