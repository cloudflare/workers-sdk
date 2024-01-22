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
		format: "cjs",
	};

	const runBuild = async () => {
		await build(config);
		// Now copy over any runtime templates so they are available when published
		await cp("src/frameworks/angular/templates", "dist/angular/templates", {
			recursive: true,
			force: true,
		});

		// npm pack doesn't include .gitignore files (see https://github.com/npm/npm/issues/3763)
		// To workaround, copy all ".gitignore" files as "__dot__gitignore" so npm pack includes them
		// The latter has been added to the project's .gitignore file
		// This renaming will be reversed when each template is used
		// We can continue to author ".gitignore" files in each template
		for (const filepath of glob.sync("templates/**/.gitignore")) {
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
