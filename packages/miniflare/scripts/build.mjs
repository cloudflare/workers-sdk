/**
 * Bundle miniflare's JavaScript using esbuild.
 *
 * This script produces the CJS bundle in dist/ that gets published to npm.
 * It does NOT handle type declarations (.d.ts) — see types.mjs for that.
 *
 * Usage:
 *   node scripts/build.mjs [--watch]
 *
 * Arguments:
 *   --watch   Re-build on file changes (uses esbuild's watch API).
 *
 * What it does:
 *   1. Bundles the main entry points (src/index.ts, dev-registry worker,
 *      test fixtures) into dist/ as CJS using esbuild.
 *   2. For each `import ... from "worker:..."` found in the source, the
 *      embedWorkersPlugin triggers a nested esbuild sub-build that:
 *      - Bundles the worker as a standalone ESM file into dist/src/workers/
 *      - Replaces the import with a lazy loader that reads the bundled worker
 *        from disk at runtime (via fs.readFileSync)
 *      This allows miniflare to embed ~30 worker scripts (for KV, R2, D1,
 *      cache, queues, etc.) that get loaded into workerd at runtime.
 *   3. Copies the pre-built local-explorer-ui assets into dist/local-explorer-ui
 *      so the explorer worker can serve them.
 *
 * Output:
 *   dist/src/index.js          Main CJS bundle
 *   dist/src/workers/...       Embedded worker ESM bundles (one per worker)
 *   dist/local-explorer-ui/    Static UI assets (copied from @cloudflare/local-explorer-ui)
 *   worker-metafiles/          esbuild metafiles for each worker (for bundle analysis)
 */

import { cpSync, existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import esbuild from "esbuild";
import { getPackage, pkgRoot } from "./common.mjs";

// --- CLI argument parsing ---

const argv = process.argv.slice(2);
const watch = argv[0] === "--watch";

// --- Helpers ---

/**
 * Collect all dependency names (dependencies, peerDependencies,
 * optionalDependencies, and optionally devDependencies) from a package.json.
 * Used to mark them as external so esbuild doesn't bundle them.
 *
 * @param {import("./common.mjs").~Package} pkg
 * @param {boolean} [includeDev]
 * @returns {string[]}
 */
function getPackageDependencies(pkg, includeDev) {
	return [
		...(pkg.dependencies ? Object.keys(pkg.dependencies) : []),
		...(includeDev && pkg.devDependencies
			? Object.keys(pkg.devDependencies)
			: []),
		...(pkg.peerDependencies ? Object.keys(pkg.peerDependencies) : []),
		...(pkg.optionalDependencies ? Object.keys(pkg.optionalDependencies) : []),
	];
}

// --- Worker embedding ---
//
// Miniflare simulates Cloudflare services (KV, R2, D1, cache, queues, etc.)
// by running small worker scripts inside workerd. These workers live under
// src/workers/ and are imported via a virtual "worker:..." scheme, e.g.:
//
//   import SCRIPT_KV from "worker:kv/namespace";
//
// The embedWorkersPlugin intercepts these imports, bundles each worker as a
// standalone ESM file, and replaces the import with a lazy loader function
// that reads the bundled file from disk at runtime. This way the published
// miniflare package contains pre-built worker scripts without needing the
// TypeScript source at runtime.

const workersRoot = path.join(pkgRoot, "src", "workers");

// Paths to workerd "extension" modules — these need special handling because
// workerd extensions can't access built-in Node modules (like node:buffer)
// but can access internal equivalents (like node-internal:internal_buffer).
const miniflareSharedExtensionPath = path.join(
	workersRoot,
	"shared",
	"index.worker.ts"
);
const miniflareZodExtensionPath = path.join(
	workersRoot,
	"shared",
	"zod.worker.ts"
);

/**
 * Test fixtures that need to be transpiled by esbuild as part of the build.
 * These are loaded dynamically by tests and must be pre-compiled.
 */
const fixtureBuilds = [
	path.join(pkgRoot, "test/fixtures/unsafe-plugin/index.ts"),
];

/**
 * esbuild plugin that rewrites `node:assert` and `node:buffer` imports to
 * their workerd-internal equivalents (`node-internal:internal_assert`, etc.).
 *
 * This is needed for the shared extension workers that run inside workerd's
 * extension environment, which doesn't expose built-in Node modules but does
 * expose their internal implementations.
 *
 * @type {esbuild.Plugin}
 */
const rewriteNodeToInternalPlugin = {
	name: "rewrite-node-to-internal",
	setup(build) {
		build.onResolve({ filter: /^node:(assert|buffer)$/ }, async (args) => {
			const module = args.path.substring("node:".length);
			return { path: `node-internal:internal_${module}`, external: true };
		});
	},
};

/**
 * Cache of esbuild build contexts for worker sub-builds. In watch mode,
 * these are reused across rebuilds for incremental compilation.
 * @type {Map<string, esbuild.BuildContext>}
 */
const workersBuilders = new Map();

/**
 * esbuild plugin that handles `import ... from "worker:..."` imports.
 *
 * For each worker import, this plugin:
 *   1. Resolves the worker source file under src/workers/
 *   2. Creates a nested esbuild context to bundle it as standalone ESM
 *   3. Writes the bundled worker to dist/src/workers/
 *   4. Saves the esbuild metafile for bundle analysis
 *   5. Returns a stub module that lazily reads the bundled worker from disk
 *      at runtime using fs.readFileSync
 *
 * The lazy-loading pattern avoids loading all ~30 worker scripts into memory
 * at startup — each worker is only read when it's actually needed.
 *
 * @type {esbuild.Plugin}
 */
const embedWorkersPlugin = {
	name: "embed-workers",
	setup(build) {
		const namespace = "embed-worker";

		// Resolve "worker:foo/bar" → src/workers/foo/bar.worker.ts
		build.onResolve({ filter: /^worker:/ }, async (args) => {
			let name = args.path.substring("worker:".length);
			// Allow `.worker` suffix to be omitted in imports
			if (!name.endsWith(".worker")) {
				name += ".worker";
			}
			// Use esbuild's resolver so workers can be .ts, .mts, .js, .mjs, etc.
			const result = await build.resolve("./" + name, {
				kind: "import-statement",
				resolveDir: workersRoot,
			});
			if (result.errors.length > 0) {
				return { errors: result.errors };
			}
			return { path: result.path, namespace };
		});

		// Bundle each worker and return a lazy-loading stub
		build.onLoad({ filter: /.*/, namespace }, async (args) => {
			// Reuse existing build context in watch mode for incremental rebuilds
			let builder = workersBuilders.get(args.path);
			if (builder === undefined) {
				builder = await esbuild.context({
					platform: "node", // Marks `node:*` imports as external
					conditions: ["workerd", "worker", "browser"],
					format: "esm",
					target: "esnext",
					bundle: true,
					sourcemap: true,
					sourcesContent: false,
					// These virtual modules are provided by workerd at runtime
					external: ["miniflare:shared", "miniflare:zod", "cloudflare:workers"],
					metafile: true,
					entryPoints: [args.path],
					minifySyntax: true,
					outdir: build.initialOptions.outdir,
					outbase: pkgRoot,
					// Shared extension workers need node:* → node-internal:*
					plugins:
						args.path === miniflareSharedExtensionPath ||
						args.path === miniflareZodExtensionPath
							? [rewriteNodeToInternalPlugin]
							: [],
				});
			}

			const metafile = (await builder.rebuild()).metafile;
			workersBuilders.set(args.path, builder);

			// Save metafile for bundle size analysis (e.g. via esbuild's analyzer)
			await fs.mkdir("worker-metafiles", { recursive: true });
			await fs.writeFile(
				path.join(
					"worker-metafiles",
					path.basename(args.path) + ".metafile.json"
				),
				JSON.stringify(metafile)
			);

			// Compute the relative path to the bundled worker JS file within dist/
			let outPath = args.path.substring(workersRoot.length + 1);
			outPath = outPath.substring(0, outPath.lastIndexOf(".")) + ".js";
			outPath = JSON.stringify(outPath);

			// Tell esbuild which files to watch for this worker (watch mode only)
			const watchFiles = Object.keys(metafile.inputs);

			// Return a stub module that lazily reads the bundled worker from disk.
			// The worker source is read once and cached in the `contents` closure.
			// A sourceURL comment is appended so devtools can map back to the file.
			const contents = `
      import fs from "fs";
      import path from "path";
      import url from "url";
      let contents;
      export default function() {
         if (contents !== undefined) return contents;
         const filePath = path.join(__dirname, "workers", ${outPath});
         contents = fs.readFileSync(filePath, "utf8") + "//# sourceURL=" + url.pathToFileURL(filePath);
         return contents;
      }
      `;

			// In one-shot mode, dispose the builder to free resources
			if (!watch) {
				builder.dispose();
			}

			return { contents, loader: "js", watchFiles };
		});
	},
};

// --- Local Explorer UI ---

/**
 * Copy the pre-built local-explorer-ui assets into miniflare's dist folder.
 * The explorer worker serves these files via a workerd disk service, so they
 * must be co-located with the miniflare package at runtime.
 *
 * @param {string} outPath  The miniflare dist output directory (dist/)
 * @param {string} pkgRoot  The miniflare package root
 */
function copyLocalExplorerUi(outPath, pkgRoot) {
	const localExplorerUiSrc = path.join(pkgRoot, "../local-explorer-ui/dist");

	if (existsSync(localExplorerUiSrc)) {
		const localExplorerUiDest = path.join(outPath, "local-explorer-ui");
		cpSync(localExplorerUiSrc, localExplorerUiDest, { recursive: true });
		console.log("Copied local-explorer-ui dist to", localExplorerUiDest);
	} else {
		throw new Error(
			"Expected local-explorer-ui to be at " + localExplorerUiSrc
		);
	}
}

// --- Main build ---

/**
 * Build the miniflare package:
 *   1. Run esbuild to bundle src/index.ts (+ dev-registry worker + test
 *      fixtures) into dist/ as CJS. The embedWorkersPlugin handles all
 *      "worker:..." imports by creating nested sub-builds.
 *   2. Copy local-explorer-ui assets into dist/.
 */
async function buildPackage() {
	const pkg = getPackage(pkgRoot);

	const indexPath = path.join(pkgRoot, "src", "index.ts");
	// The dev registry proxy runs in a Node.js worker thread (instead of workerd)
	// and requires a separate entry point so it can be loaded independently
	const devRegistryProxyPath = path.join(
		pkgRoot,
		"src",
		"shared",
		"dev-registry.worker.ts"
	);
	const outPath = path.join(pkgRoot, "dist");

	const buildOptions = {
		platform: "node",
		format: "cjs",
		target: "esnext",
		bundle: true,
		sourcemap: true,
		sourcesContent: false,
		tsconfig: path.join(pkgRoot, "tsconfig.json"),
		external: [
			// Don't bundle miniflare itself — we want tests to run against
			// the actual published code, not a re-bundled copy
			"miniflare",
			// Mark runtime dependencies as external (they'll be installed by npm).
			// devDependencies are intentionally NOT listed here — small/single-use
			// devDependencies are inlined into the bundle to reduce install size.
			...getPackageDependencies(pkg),
			// esbuild is used by test fixtures at runtime
			"esbuild",
		],
		plugins: [embedWorkersPlugin],
		logLevel: watch ? "info" : "warning",
		outdir: outPath,
		outbase: pkgRoot,
		entryPoints: [indexPath, devRegistryProxyPath, ...fixtureBuilds],
	};

	if (watch) {
		const ctx = await esbuild.context(buildOptions);
		await ctx.watch();
	} else {
		await esbuild.build(buildOptions);
	}

	copyLocalExplorerUi(outPath, pkgRoot);
}

buildPackage().catch((e) => {
	console.error("Failed to build miniflare", e);
	process.exit(1);
});
