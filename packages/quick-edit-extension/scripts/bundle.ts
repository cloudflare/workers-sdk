import assert from "assert";
import { readFile } from "fs/promises";
import path from "path";
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
						const result = path.resolve(
							"node_modules/@cloudflare/workers-types/experimental/index.d.ts"
						);
						return {
							path: result,
							namespace: "raw-file",
						};
					});

					build.onLoad(
						{ filter: /.*/, namespace: "raw-file" },
						async (args) => {
							const contents = await readFile(args.path);
							// Make sure we're loading the .d.ts and not the .ts version of the types.
							// Occasionally the wrong version has been loaded in CI, causing spurious typing errors
							// for users in the playground & quick edit.
							// The .d.ts file should not include `export declare` anywhere, while the .ts does
							assert(!/export declare/.test(contents.toString()));
							return { contents, loader: "text" };
						}
					);
				},
			},
		],
	};

	if (flags.watch) {
		const ctx = await esbuild.context(options);

		// Start watching for changes...
		await ctx.watch();
	} else {
		await esbuild.build(options);
	}
}

async function run() {
	await buildMain({ watch: process.argv.includes("--watch") });
}

run().catch((e) => {
	console.error(e);
	process.exit(1);
});
