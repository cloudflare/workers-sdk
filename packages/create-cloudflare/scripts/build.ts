import { cp } from "fs/promises";
import { build, BuildOptions, context } from "esbuild";
import * as glob from "glob";

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
		define: {
			"process.env.SPARROW_SOURCE_KEY": JSON.stringify(
				process.env.SPARROW_SOURCE_KEY ?? "",
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
		for (const filepath of glob.sync("templates*/**/.gitignore")) {
			await cp(filepath, filepath.replace(".gitignore", "__dot__gitignore"));
		}
	};

	const runWatch = async () => {
		let ctx = await context(config);
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
