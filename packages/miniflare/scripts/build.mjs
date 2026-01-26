import fs from "node:fs/promises";
import path from "node:path";
import esbuild from "esbuild";
import { getPackage, pkgRoot } from "./common.mjs";

const argv = process.argv.slice(2);
const watch = argv[0] === "watch";

/**
 * Gets a list of dependency names from the passed package
 * @param {~Package} pkg
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

const workersRoot = path.join(pkgRoot, "src", "workers");

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
 * An array of test fixtures that require transpilation via ESBuild.
 * These are loaded dynamically by tests and need to be pre-compiled.
 */
const fixtureBuilds = [
	path.join(pkgRoot, "test/fixtures/unsafe-plugin/index.ts"),
];

/**
 * `workerd` `extensions` don't have access to "built-in" modules like
 * `node:buffer`, but do have access to "internal" modules like
 * `node-internal:internal_buffer`, which usually provide the same exports.
 * So that we can use `node:assert` and `node:buffer` in our shared extension,
 * rewrite built-in names to internal.
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
 * @type {Map<string, esbuild.BuildResult>}
 */
const workersBuilders = new Map();
/**
 * @type {esbuild.Plugin}
 */
const embedWorkersPlugin = {
	name: "embed-workers",
	setup(build) {
		const namespace = "embed-worker";
		build.onResolve({ filter: /^worker:/ }, async (args) => {
			let name = args.path.substring("worker:".length);
			// Allow `.worker` to be omitted
			if (!name.endsWith(".worker")) name += ".worker";
			// Use `build.resolve()` API so Workers can be written as `m?[jt]s` files
			const result = await build.resolve("./" + name, {
				kind: "import-statement",
				resolveDir: workersRoot,
			});
			if (result.errors.length > 0) return { errors: result.errors };
			return { path: result.path, namespace };
		});
		build.onLoad({ filter: /.*/, namespace }, async (args) => {
			let builder = workersBuilders.get(args.path);
			if (builder === undefined) {
				builder = await esbuild.context({
					platform: "node", // Marks `node:*` imports as external
					format: "esm",
					target: "esnext",
					bundle: true,
					sourcemap: true,
					sourcesContent: false,
					external: ["miniflare:shared", "miniflare:zod", "cloudflare:workers"],
					metafile: true,
					entryPoints: [args.path],
					minifySyntax: true,
					outdir: build.initialOptions.outdir,
					outbase: pkgRoot,
					plugins:
						args.path === miniflareSharedExtensionPath ||
						args.path === miniflareZodExtensionPath
							? [rewriteNodeToInternalPlugin]
							: [],
				});
			}
			const metafile = (await builder.rebuild()).metafile;
			workersBuilders.set(args.path, builder);
			await fs.mkdir("worker-metafiles", { recursive: true });
			await fs.writeFile(
				path.join(
					"worker-metafiles",
					path.basename(args.path) + ".metafile.json"
				),
				JSON.stringify(metafile)
			);
			let outPath = args.path.substring(workersRoot.length + 1);
			outPath = outPath.substring(0, outPath.lastIndexOf(".")) + ".js";
			outPath = JSON.stringify(outPath);
			const watchFiles = Object.keys(metafile.inputs);
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
			if (!watch) {
				builder.dispose();
			}
			return { contents, loader: "js", watchFiles };
		});
	},
};

async function buildPackage() {
	const pkg = getPackage(pkgRoot);

	const indexPath = path.join(pkgRoot, "src", "index.ts");
	// The dev registry proxy runs in a Node.js worker thread (instead of workerd) and
	// requires a separate entry file
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
		// Mark root package's dependencies as external, include root devDependencies
		// (e.g. test runner) as we don't want these bundled
		external: [
			// Make sure we're not bundling any packages we're building, we want to
			// test against the actual code we'll publish for instance
			"miniflare",
			// Mark `dependencies` as external, but not `devDependencies` (we use them
			// to signal single-use/small packages we want inlined in the bundle)
			...getPackageDependencies(pkg),
			// Mark esbuild as external (used by test fixtures)
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
}

buildPackage().catch((e) => {
	console.error("Failed to build miniflare", e);
	process.exit(1);
});
