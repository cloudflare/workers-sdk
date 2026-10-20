import { cp } from "node:fs/promises";
import { globSync } from "tinyglobby";
import { defineConfig } from "tsdown";

export default defineConfig({
	entry: { cli: "src/cli.ts" },
	format: "cjs",
	fixedExtension: false,
	dts: false,
	// jsonc-parser's ESM entry is needed when bundling it into CommonJS.
	inputOptions: { resolve: { mainFields: ["module", "main"] } },
	define: {
		"process.env.SPARROW_SOURCE_KEY": JSON.stringify(
			process.env.SPARROW_SOURCE_KEY ?? ""
		),
	},
	hooks: {
		"build:done": async () => {
			// npm omits .gitignore files from tarballs. Templates restore these names.
			for (const file of globSync("templates*/**/.gitignore")) {
				await cp(file, file.replace(".gitignore", "__dot__gitignore"));
			}
		},
	},
});
