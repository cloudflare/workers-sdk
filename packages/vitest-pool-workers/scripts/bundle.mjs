import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import esbuild from "esbuild";

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

const libPaths = Array.from(walk(path.join(pkgRoot, "src", "worker", "lib")));

/** @type {import("esbuild").BuildOptions} */
const commonOptions = {
	platform: "node",
	target: "esnext",
	bundle: true,
	packages: "external",
	external: ["cloudflare:test"],
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
	entryPoints: libPaths.filter((libPath) => /\.cts$/.test(libPath)),
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
