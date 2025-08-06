// @ts-check
import path from "node:path";
import esbuild from "esbuild";

const outDir = path.resolve(import.meta.dirname, "../dist");

async function buildPackage() {

	/** @type {esbuild.BuildOptions} */
	const buildOptions = {
		platform: "node",
		format: "cjs",
		target: "esnext",
		bundle: true,
		sourcemap: true,
		sourcesContent: false,
		tsconfig: path.join(import.meta.dirname, "../tsconfig.json"),
		// Mark root package's dependencies as external, include root devDependencies
		// (e.g. test runner) as we don't want these bundled
		external: [
			// Make sure we're not bundling any packages we're building, we want to
			// test against the actual code we'll publish for instance
			"miniflare",
			"esbuild",
		],
		logLevel: "warning",
		outdir: outDir,
		entryPoints: [path.join(import.meta.dirname, "../src/index.ts")],
	};

	await esbuild.build(buildOptions);
}

buildPackage().catch((e) => {
	console.error("Failed to build miniflare-shared package", e);
	process.exit(1);
});
