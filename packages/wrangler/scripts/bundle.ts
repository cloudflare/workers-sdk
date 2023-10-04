import fs from "node:fs/promises";
import path from "node:path";
import * as esbuild from "esbuild";
import { EXTERNAL_DEPENDENCIES } from "./deps";
import type { BuildOptions, Plugin, BuildContext } from "esbuild";

// the expectation is that this is being run from the project root
type BuildFlags = {
	watch?: boolean;
};

const WATCH = process.argv.includes("--watch");
const TEMPLATES_DIR = path.join(__dirname, "../templates");

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

	const options: BuildOptions = {
		keepNames: true,
		entryPoints: ["./src/cli.ts"],
		bundle: true,
		outdir,
		platform: "node",
		format: "cjs",
		external: EXTERNAL_DEPENDENCIES,
		sourcemap: process.env.SOURCEMAPS !== "false",
		inject: [path.join(__dirname, "../import_meta_url.js")],
		// This is required to support jsonc-parser. See https://github.com/microsoft/node-jsonc-parser/issues/57
		mainFields: ["module", "main"],
		define: {
			__RELATIVE_PACKAGE_PATH__,
			"import.meta.url": "import_meta_url",
			"process.env.NODE_ENV": `'${process.env.NODE_ENV || "production"}'`,
			...(process.env.SPARROW_SOURCE_KEY
				? { SPARROW_SOURCE_KEY: `"${process.env.SPARROW_SOURCE_KEY}"` }
				: {}),
			...(process.env.ALGOLIA_APP_ID
				? { ALGOLIA_APP_ID: `"${process.env.ALGOLIA_APP_ID}"` }
				: {}),
			...(process.env.ALGOLIA_PUBLIC_KEY
				? { ALGOLIA_PUBLIC_KEY: `"${process.env.ALGOLIA_PUBLIC_KEY}"` }
				: {}),
		},
		plugins: [embedWorkersPlugin],
	};

	if (flags.watch) {
		const ctx = await esbuild.context(options);
		await ctx.watch();
	} else {
		await esbuild.build(options);
	}

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

const workersContexts = new Map<string, BuildContext>();
const embedWorkersPlugin: Plugin = {
	name: "embed-workers",
	setup(build) {
		const namespace = "embed-worker";
		build.onResolve({ filter: /^worker:/ }, async (args) => {
			const name = args.path.substring("worker:".length);
			// Use `build.resolve()` API so Workers can be written as `m?[jt]s` files
			const result = await build.resolve("./" + name, {
				kind: "import-statement",
				resolveDir: TEMPLATES_DIR,
			});
			if (result.errors.length > 0) return { errors: result.errors };
			return { path: result.path, namespace };
		});
		build.onLoad({ filter: /.*/, namespace }, async (args) => {
			const ctx =
				workersContexts.get(args.path) ??
				(await esbuild.context({
					platform: "node", // Marks `node:*` imports as external
					format: "esm",
					target: "esnext",
					bundle: true,
					sourcemap: true,
					sourcesContent: false,
					metafile: true,
					entryPoints: [args.path],
					outdir: build.initialOptions.outdir,
				}));
			const result = await ctx.rebuild();
			workersContexts.set(args.path, ctx);
			const watchFiles = Object.keys(result?.metafile?.inputs ?? {});
			const scriptPath = Object.keys(result?.metafile?.outputs ?? {}).find(
				(filepath) => filepath.endsWith(".js")
			);

			const contents = `
				import path from "node:path";
				const scriptPath = path.resolve(__dirname, "..", "${scriptPath}");
				export default scriptPath;
            `;

			return { contents, loader: "js", watchFiles };
		});
	},
};

async function run() {
	// main cli
	await buildMain();

	// After built once completely, rerun them both in watch mode
	if (WATCH) {
		console.log("Built. Watching for changes...");
		await buildMain({ watch: true });
	} else {
		for (const ctx of workersContexts.values()) await ctx.dispose();
	}
}

run().catch((e) => {
	console.error(e);
	process.exit(1);
});
