import { readFile } from "fs/promises";
import * as esbuild from "esbuild";

type BuildFlags = {
	watch?: boolean;
};

async function buildMain(flags: BuildFlags = {}) {
	const options: esbuild.BuildOptions = {
		entryPoints: ["./src/extension.ts"],
		bundle: true,
		outfile: "./dist/extension.js",
		format: "cjs",
		external: ["vscode"],
		logLevel: "info",
		plugins: [
			{
				name: "workers-types",
				setup(build) {
					build.onResolve({ filter: /^raw:.*/ }, async (args) => {
						const result = await build.resolve(args.path.slice(4), {
							kind: "import-statement",
							resolveDir: args.resolveDir,
						});
						return {
							path: result.path,
							namespace: "raw-file",
						};
					});

					build.onLoad(
						{ filter: /.*/, namespace: "raw-file" },
						async (args) => {
							const contents = await readFile(args.path);
							return { contents, loader: "text" };
						}
					);
				},
			},
		],
	};
	if (flags.watch) {
		const ctx = await esbuild.context(options);
		await ctx.watch();
	} else {
		await esbuild.build(options);
	}
}

async function run() {
	await buildMain();
	if (process.argv.includes("--watch")) {
		console.log("Built. Watching for changes...");
		await Promise.all([buildMain({ watch: true })]);
	}
}

run().catch((e) => {
	console.error(e);
	process.exit(1);
});
