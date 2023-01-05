import fs from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";
import { EXTERNAL_DEPENDENCIES } from "./deps";
import type { WatchMode } from "esbuild";

// the expectation is that this is being run from the project root
type BuildFlags = {
	watch?: boolean;
};

function watchLogger(outputPath: string): WatchMode {
	return {
		onRebuild(error, _) {
			if (error) {
				console.error(`${outputPath} build failed.\n`, error);
			} else {
				console.log(`${outputPath} updated.`);
			}
		},
	};
}

async function buildMain(flags: BuildFlags = {}) {
	const outdir = path.resolve("./wrangler-dist");
	const wranglerPackageDir = path.resolve(".");
	/**
	 * The relative path between the bundled code and the Wrangler package.
	 * This is used as a reliable way to compute paths relative to the Wrangler package
	 * in the source files, rather than relying upon `__dirname` which can change depending
	 * on whether the source files have been bundled and the location of the outdir.
	 *
	 * This is exposed in the source via the `getBasePath()` function, which should be used
	 * in place of `__dirname` and similar Node.js constants.
	 */
	const __RELATIVE_PACKAGE_PATH__ = `"${path.relative(
		outdir,
		wranglerPackageDir
	)}"`;
	await build({
		entryPoints: ["./src/cli.ts"],
		bundle: true,
		outdir,
		platform: "node",
		format: "cjs",
		external: EXTERNAL_DEPENDENCIES,
		sourcemap: process.env.SOURCEMAPS !== "false",
		inject: [path.join(__dirname, "../import_meta_url.js")],
		define: {
			__RELATIVE_PACKAGE_PATH__,
			"import.meta.url": "import_meta_url",
			"process.env.NODE_ENV": `'${process.env.NODE_ENV || "production"}'`,
			...(process.env.SPARROW_SOURCE_KEY
				? { SPARROW_SOURCE_KEY: `"${process.env.SPARROW_SOURCE_KEY}"` }
				: {}),
		},
		watch: flags.watch ? watchLogger("./wrangler-dist") : false,
	});

	// Copy `yoga-layout` `.wasm` file
	const yogaLayoutEntrypoint = require.resolve("yoga-layout");
	const wasmSrc = path.resolve(
		yogaLayoutEntrypoint,
		"..",
		"..",
		"build",
		"wasm-sync.wasm"
	);
	const wasmDst = path.resolve(outdir, "wasm-sync.wasm");
	await fs.copyFile(wasmSrc, wasmDst);
}

async function buildMiniflareCLI(flags: BuildFlags = {}) {
	await build({
		entryPoints: ["./src/miniflare-cli/index.ts"],
		bundle: true,
		outfile: "./miniflare-dist/index.mjs",
		platform: "node",
		format: "esm",
		external: EXTERNAL_DEPENDENCIES,
		sourcemap: process.env.SOURCEMAPS !== "false",
		define: {
			"process.env.NODE_ENV": `'${process.env.NODE_ENV || "production"}'`,
		},
		watch: flags.watch ? watchLogger("./miniflare-dist/index.mjs") : false,
	});
}

async function run() {
	// main cli
	await buildMain();

	// custom miniflare cli
	await buildMiniflareCLI();

	// After built once completely, rerun them both in watch mode
	if (process.argv.includes("--watch")) {
		console.log("Built. Watching for changes...");
		await Promise.all([
			buildMain({ watch: true }),
			buildMiniflareCLI({ watch: true }),
		]);
	}
}

run().catch((e) => {
	console.error(e);
	process.exit(1);
});
