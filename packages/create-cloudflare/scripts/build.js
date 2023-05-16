const { build, context } = require("esbuild");
const { cp } = require("fs/promises");

const run = async () => {
	const argv = process.argv.slice(2);
	const watchMode = argv[0] === "--watch";

	const config = {
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
