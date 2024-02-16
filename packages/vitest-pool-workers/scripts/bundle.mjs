import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import esbuild from "esbuild";
import { resolve } from "import-meta-resolve";

const argv = process.argv.slice(2);
const watch = argv[0] === "watch";

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pkgRoot = path.resolve(__dirname, "..");

/**
 * @param {string} rootPath
 * @returns {Generator<string>}
 */
function* walk(rootPath) {
	for (const entry of fs.readdirSync(rootPath, { withFileTypes: true })) {
		const filePath = path.join(rootPath, entry.name);
		if (entry.isDirectory()) yield* walk(filePath);
		else yield filePath;
	}
}

// Build a stripped down version of `undici` with just the `MockAgent` and some
// useful helpers exposed. In particular, code for actually sending network
// requests is removed, and replaced with a hook for providing this
// functionality at runtime.
function map(specifier, target) {
	const filePath = url.fileURLToPath(resolve(specifier, import.meta.url));
	const targetPath = path.join(pkgRoot, target);
	return { [filePath]: targetPath };
}
const fetchMockPathMap = {
	...map("undici/lib/client.js", "src/mock-agent/client.cjs"),
	...map("undici/lib/pool.js", "src/mock-agent/pool.cjs"),
	...map(
		"undici/lib/mock/pending-interceptors-formatter.js",
		"src/mock-agent/pending-interceptor-formatter.cjs"
	),
};
await esbuild.build({
	platform: "node",
	target: "esnext",
	format: "cjs",
	outExtension: { ".js": ".cjs" },
	bundle: true,
	sourcemap: true,
	sourcesContent: false,
	logLevel: "warning",
	outdir: path.join(pkgRoot, "dist/worker/lib/cloudflare"),
	entryNames: "mock-agent",
	entryPoints: [path.join(pkgRoot, "src/mock-agent/index.cjs")],
	plugins: [
		{
			name: "path-map",
			setup(build) {
				build.onResolve(
					{ filter: /^\..+$/, namespace: "file" },
					async (args) => {
						const result = await build.resolve(args.path, {
							namespace: "resolve", // `args.path` would lead to cycles
							importer: args.importer,
							resolveDir: args.resolveDir,
							kind: args.kind,
						});
						const maybePath = fetchMockPathMap[result.path];
						if (maybePath === undefined) return;
						return { path: maybePath };
					}
				);
			},
		},
	],
});

// Build pool, worker and libs
const libPaths = Array.from(walk(path.join(pkgRoot, "src", "worker", "lib")));

/** @type {import("esbuild").BuildOptions} */
const commonOptions = {
	platform: "node",
	target: "esnext",
	bundle: true,
	packages: "external",
	external: ["cloudflare:*"],
	sourcemap: true,
	sourcesContent: false,
	logLevel: watch ? "info" : "warning",
	outdir: path.join(pkgRoot, "dist"),
	outbase: path.join(pkgRoot, "src"),
};

const esmOptions = {
	...commonOptions,
	format: "esm",
	outExtension: { ".js": ".mjs" },
	entryPoints: [
		path.join(pkgRoot, "src", "pool", "index.ts"),
		path.join(pkgRoot, "src", "worker", "index.ts"),
		...libPaths.filter((libPath) => /\.m?ts$/.test(libPath)),
	],
};

const cjsOptions = {
	...commonOptions,
	format: "cjs",
	outExtension: { ".js": ".cjs" },
	entryPoints: [
		path.join(pkgRoot, "src", "config", "index.ts"),
		...libPaths.filter((libPath) => /\.cts$/.test(libPath)),
	],
};

if (watch) {
	const esmCtx = await esbuild.context(esmOptions);
	const cjsCtx = await esbuild.context(cjsOptions);
	await esmCtx.watch();
	await cjsCtx.watch();
} else {
	await esbuild.build(esmOptions);
	await esbuild.build(cjsOptions);
}
