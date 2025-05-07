import { writeFileSync } from "node:fs";
import path from "node:path";
import * as esbuild from "esbuild";
import type { BuildOptions } from "esbuild";

async function buildMain() {
	const options: BuildOptions = {
		keepNames: true,
		entryPoints: ["./src/index.ts"],
		bundle: true,
		outfile: path.resolve("./dist/index.cjs"),
		platform: "node",
		format: "cjs",
		metafile: true,
		external: ["node-pty"],
	};

	const res = await esbuild.build(options);
	writeFileSync("metafile.json", JSON.stringify(res.metafile));
}

async function run() {
	await buildMain();
}

run().catch((e) => {
	console.error(e);
	process.exit(1);
});
