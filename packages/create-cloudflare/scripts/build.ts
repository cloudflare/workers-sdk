import { cp } from "node:fs/promises";
import path from "node:path";
import { build, context } from "esbuild";
import { globSync } from "tinyglobby";
import type { BuildOptions } from "esbuild";

const run = async () => {
	const argv = process.argv.slice(2);
	const watchMode = argv[0] === "--watch";

	const config: BuildOptions = {
		entryPoints: ["./src/cli.ts"],
		bundle: true,
		outdir: "./dist",
		platform: "node",
		// This is required to support jsonc-parser. See https://github.com/microsoft/node-jsonc-parser/issues/57
		mainFields: ["module", "main"],
		format: "cjs",
		// Provide a real `import.meta.url` for the CJS bundle. Bundled ESM
		// dependencies (e.g. `@cloudflare/workers-utils`) contain
		// `createRequire(import.meta.url)` shims that would otherwise receive
		// `undefined` and throw on load. Mirrors wrangler's tsup config.
		inject: [path.join(__dirname, "..", "import-meta-url.js")],
		define: {
			"import.meta.url": "import_meta_url",
			"process.env.SPARROW_SOURCE_KEY": JSON.stringify(
				process.env.SPARROW_SOURCE_KEY ?? ""
			),
		},
	};

	const runBuild = async () => {
		await build(config);
		// npm pack doesn't include .gitignore files (see https://github.com/npm/npm/issues/3763)
		// To workaround, copy all ".gitignore" files as "__dot__gitignore" so npm pack includes them
		// The latter has been added to the project's .gitignore file
		// This renaming will be reversed when each template is used
		// We can continue to author ".gitignore" files in each template
		for (const filepath of globSync("templates*/**/.gitignore")) {
			await cp(filepath, filepath.replace(".gitignore", "__dot__gitignore"));
		}
	};

	const runWatch = async () => {
		const ctx = await context(config);
		await ctx.watch();
		console.log("Watching...");
	};

	if (watchMode) {
		await runWatch();
	} else {
		await runBuild();
	}
};

run().catch((error) => {
	console.error(error);
	process.exit(1);
});
