import assert from "node:assert";
import fs from "node:fs";
import module from "node:module";
import path from "node:path";
import util from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as cjsModuleLexer from "cjs-module-lexer";
import { buildSync } from "esbuild";
import { moduleResolve } from "import-meta-resolve";
import { Response } from "miniflare";
import { isFileNotFoundError } from "./helpers";
import type { Request, Worker_Module } from "miniflare";

let debuglog: util.DebugLoggerFunction = util.debuglog(
	"vitest-pool-workers:module-fallback",
	(log) => (debuglog = log)
);

export const modulesRoot = "/";

// Building to an ES module, but Vite will provide `__dirname`
const distPath = path.resolve(__dirname, "..");
const libPath = path.join(distPath, "worker", "lib");

// File path suffix to disable CJS to ESM-with-named-exports shimming
const disableCjsEsmShimSuffix = ".mf_vitest_no_cjs_esm_shim";
function trimSuffix(suffix: string, value: string) {
	assert(value.endsWith(suffix));
	return value.substring(0, value.length - suffix.length);
}

// Node.js built-in modules provided by `workerd`
const workerdBuiltinModules = [
	"node:_stream_duplex",
	"node:_stream_passthrough",
	"node:_stream_readable",
	"node:_stream_readable",
	"node:_stream_transform",
	"node:_stream_writable",
	"node:assert",
	"node:async_hooks",
	"node:buffer",
	"node:crypto",
	"node:diagnostics_channel",
	"node:events",
	"node:path",
	// "node:process", // Doesn't support all that we need
	"node:stream",
	"node:string_decoder",
	"node:util",
];
const conditions = new Set(["workerd", "worker", "browser", "import"]);

// `chai` contains circular `require()`s which aren't supported by `workerd`
// TODO(someday): support circular `require()` in `workerd`
const bundleDependencies = ["chai"];

function fileURLToPosixPath(url: string | URL) {
	if (typeof url === "string") url = new URL(url);
	// TODO(soon): check this actually works for Windows
	// Some URLs contain hashes, e.g. if relying on an import map
	return fileURLToPath(url).replaceAll("\\", "/") + url.hash;
}

function isFile(filePath: string): boolean {
	try {
		return fs.statSync(filePath).isFile();
	} catch (e) {
		if (isFileNotFoundError(e)) return false;
		throw e;
	}
}

const dirPathTypeModuleCache = new Map<string, boolean>();
function isWithinTypeModuleContext(filePath: string): boolean {
	const dirPath = path.dirname(filePath);
	if (dirPath === filePath) return false;
	let cache = dirPathTypeModuleCache.get(dirPath);
	if (cache !== undefined) return cache;

	try {
		const pkgPath = path.join(dirPath, "package.json");
		const pkgJson = fs.readFileSync(pkgPath, "utf8");
		const pkg = JSON.parse(pkgJson);
		cache = pkg.type === "module";
	} catch (e: unknown) {
		if (!isFileNotFoundError(e)) throw e;
		cache = isWithinTypeModuleContext(dirPath);
	}

	dirPathTypeModuleCache.set(dirPath, cache);
	return cache;
}

await cjsModuleLexer.init();
function getCjsNamedExports(
	filePath: string,
	contents: string,
	seen = new Set()
): Set<string> {
	const { exports, reexports } = cjsModuleLexer.parse(contents);
	const result = new Set(exports);
	for (const reexport of reexports) {
		const resolved = requireResolve(reexport, filePath);
		if (seen.has(resolved)) continue;
		try {
			const resolvedContents = fs.readFileSync(resolved, "utf8");
			seen.add(filePath);
			const resolvedNames = getCjsNamedExports(
				resolved,
				resolvedContents,
				seen
			);
			seen.delete(filePath);
			for (const name of resolvedNames) result.add(name);
		} catch (e) {
			if (!isFileNotFoundError(e)) throw e;
		}
	}
	result.delete("default");
	result.delete("__esModule");
	return result;
}

function withSourceUrl(contents: string, url: string | URL): string {
	// If we've already got a `//# sourceURL` comment, return `script` as is
	// (searching from the end as that's where we'd expect it)
	if (contents.lastIndexOf("//# sourceURL=") !== -1) return contents;
	// Make sure `//# sourceURL` comment is on its own line
	const sourceURL = `\n//# sourceURL=${url.toString()}\n`;
	return contents + sourceURL;
}

function withImportMetaUrl(contents: string, url: string | URL): string {
	// TODO(soon): this isn't perfect, ideally need `workerd` support
	return contents.replaceAll("import.meta.url", JSON.stringify(url.toString()));
}

const bundleCache = new Map<string, string>();
function bundleDependency(entryPath: string): string {
	let output = bundleCache.get(entryPath);
	if (output !== undefined) return output;
	debuglog(`Bundling ${entryPath}...`);
	const result = buildSync({
		platform: "node",
		target: "esnext",
		format: "cjs",
		bundle: true,
		packages: "external",
		sourcemap: "inline",
		sourcesContent: false,
		entryPoints: [entryPath],
		write: false,
	});
	assert(result.outputFiles.length === 1);
	output = result.outputFiles[0].text;
	bundleCache.set(entryPath, output);
	return output;
}

const jsExtensions = [".js", ".mjs", ".cjs"];
function maybeGetTargetFilePath(target: string): string | undefined {
	// Can't use `fs.existsSync()` here as `target` could be a directory
	// (e.g. `node:fs` and `node:fs/promises`)
	if (isFile(target)) return target;
	for (const extension of jsExtensions) {
		const targetWithExtension = target + extension;
		if (fs.existsSync(targetWithExtension)) return targetWithExtension;
	}
	if (target.endsWith(disableCjsEsmShimSuffix)) return target;
}

function getApproximateSpecifier(target: string, referrerDir: string): string {
	// `target` is the path to the "file" `workerd` is trying to load,
	// `referrer` is the path to the file that imported/required the `target`,
	// `referrerDir` is the dirname of `referrer`
	//
	// For example, if the `referrer` is "/a/b/c/index.mjs":
	//
	// | Import Statement            | `target`           | Return             |
	// |-----------------------------|--------------------|--------------------|
	// | import "./dep.mjs"          | /a/b/c/dep.mjs     | dep.mjs            |
	// | import "../dep.mjs"         | /a/b/dep.mjs       | ../dep.mjs         |
	// | import "pkg"                | /a/b/c/pkg         | pkg                |
	// | import "@org/pkg"           | /a/b/c/@org/pkg    | @org/pkg           |
	// | import "node:assert"        | node:assert        | node:assert        |
	// | import "cloudflare:sockets" | cloudflare:sockets | cloudflare:sockets |
	// | import "workerd:rtti"       | workerd:rtti       | workerd:rtti       |
	// | import "random:pkg"         | /a/b/c/random:pkg  | random:pkg         |
	//
	// Note that we return `dep.mjs` for `import "./dep.mjs"`. This would fail
	// ES module resolution, so must be handled by `maybeGetTargetFilePath()`
	// before calling this function.
	if (/^(node|cloudflare|workerd):/.test(target)) return target;
	return path.posix.relative(referrerDir, target);
}

const requires = new Map<string, NodeRequire>();
function requireResolve(specifier: string, referrer: string): string {
	const referrerDir = path.posix.dirname(referrer);
	const normalisedReferrer = path.posix.join(referrerDir, "_");
	let require = requires.get(normalisedReferrer);
	if (require === undefined) {
		require = module.createRequire(normalisedReferrer);
		requires.set(normalisedReferrer, require);
	}
	return require.resolve(specifier);
}

function importResolve(specifier: string, referrer: string): URL {
	const referrerUrl = pathToFileURL(referrer);
	return moduleResolve(specifier, referrerUrl, conditions);
}

type ResolveMethod = "import" | "require";
function mustResolve(
	method: ResolveMethod,
	target: string,
	specifier: string,
	referrer: string
): string /* filePath */ {
	const referrerDir = path.posix.dirname(referrer);

	let filePath = maybeGetTargetFilePath(target);
	if (filePath !== undefined) return filePath;

	// `workerd` will always try to resolve modules relative to the referencing
	// dir first. Built-in `node:*`/`cloudflare:*` imports only exist at the root.
	// We need to ensure we only load a single copy of these modules, therefore,
	// we return a redirect to the root here. Note `workerd` will automatically
	// look in the root if we return 404 from the fallback service when
	// *import*ing `node:*`/`cloudflare:*` modules, but not when *require()*ing
	// them. For the sake of consistency (and a nice return type on this function)
	// we return a redirect for `import`s too.
	if (referrerDir !== "/" && workerdBuiltinModules.includes(specifier)) {
		return `/${specifier}`;
	}

	const specifierLibPath = path.posix.join(
		libPath,
		specifier.replaceAll(":", "/")
	);
	filePath = maybeGetTargetFilePath(specifierLibPath);
	if (filePath !== undefined) return filePath;

	if (method === "import") {
		const resolvedUrl = importResolve(specifier, referrer);
		if (resolvedUrl.protocol === "node:") {
			// Handle case where `node:*` built-in resolved from import map
			// (e.g. https://github.com/sindresorhus/p-limit/blob/f53bdb5f464ae112b2859e834fdebedc0745199b/package.json#L20)
			filePath = `/${resolvedUrl.href}`;
		} else {
			filePath = fileURLToPosixPath(resolvedUrl);
		}
	} else {
		try {
			filePath = requireResolve(specifier, referrer);
		} catch {
			// If `specifier` look something like `chai/utils`,
			// it could mean the `utils` sub-path export of the `chai` package,
			// or `./chai/utils/index.js`. If the first failed, try the second.
			filePath = requireResolve(`./${specifier}`, referrer);
		}
	}
	return filePath;
}

function buildRedirectResponse(filePath: string) {
	return new Response(null, { status: 301, headers: { Location: filePath } });
}

type ModuleContents = Omit<Worker_Module, "name">;
function buildModuleResponse(target: string, contents: ModuleContents) {
	const name = path.posix.relative(modulesRoot, target);
	return new Response(JSON.stringify({ name, ...contents }));
}

function mustLoad(
	logBase: string,
	method: ResolveMethod,
	target: string,
	specifier: string,
	filePath: string
): Response {
	if (target !== filePath) {
		// We might `import` and `require` the same CommonJS package. In this case,
		// we want to respond with an ES module shim for the `import`, and the
		// module as is otherwise. If we're `require()`ing a package, make sure we
		// redirect to the module disabling the ES module shim.
		if (method === "require" && !specifier.startsWith("node:")) {
			filePath += disableCjsEsmShimSuffix;
		}
		debuglog(logBase, "redirect:", filePath);
		return buildRedirectResponse(filePath);
	}

	// If we're importing from a shim module, don't shim again
	const disableCjsEsmShim = filePath.endsWith(disableCjsEsmShimSuffix);
	if (disableCjsEsmShim) {
		filePath = trimSuffix(disableCjsEsmShimSuffix, filePath);
	}

	let isEsm =
		filePath.endsWith(".mjs") ||
		(filePath.endsWith(".js") && isWithinTypeModuleContext(filePath));

	let contents: string;
	const maybeBundled = bundleCache.get(filePath);
	if (maybeBundled !== undefined) {
		contents = maybeBundled;
		isEsm = false;
	} else {
		contents = fs.readFileSync(filePath, "utf8");
	}
	const targetUrl = pathToFileURL(target);
	contents = withSourceUrl(contents, targetUrl);

	if (isEsm) {
		// Respond with ES module
		contents = withImportMetaUrl(contents, targetUrl);
		debuglog(logBase, "esm:", filePath);
		return buildModuleResponse(target, { esModule: contents });
	}

	// Respond with CommonJS module

	// If we're `import`ing a CommonJS module, or we're `require`ing a `node:*`
	// module from a NodeJsCompatModule, return an ES module shim. Note
	// NodeJsCompatModules can `require` ES modules, using the default export.
	const insertCjsEsmShim = method === "import" || specifier.startsWith("node:");
	if (insertCjsEsmShim && !disableCjsEsmShim) {
		const fileName = path.posix.basename(filePath);
		const disableShimSpecifier = `./${fileName}${disableCjsEsmShimSuffix}`;
		const quotedDisableShimSpecifier = JSON.stringify(disableShimSpecifier);
		let esModule = `import mod from ${quotedDisableShimSpecifier}; export default mod;`;
		for (const name of getCjsNamedExports(filePath, contents)) {
			esModule += ` export const ${name} = mod.${name};`;
		}
		debuglog(logBase, "cjs-esm-shim:", filePath);
		return buildModuleResponse(target, { esModule });
	}

	// Otherwise, if we're `require`ing a non-`node:*` module, just return a
	// NodeJsCompatModule
	debuglog(logBase, "cjs:", filePath);
	return buildModuleResponse(target, { nodeJsCompatModule: contents });
}

export function handleModuleFallbackRequest(request: Request): Response {
	const method = request.headers.get("X-Resolve-Method");
	assert(method === "import" || method === "require");
	const url = new URL(request.url);
	const target = url.searchParams.get("specifier");
	const referrer = url.searchParams.get("referrer");
	assert(target !== null, "Expected specifier search param");
	assert(referrer !== null, "Expected referrer search param");
	const referrerDir = path.posix.dirname(referrer);
	const specifier = getApproximateSpecifier(target, referrerDir);

	const quotedTarget = JSON.stringify(target);
	const logBase = `${method}(${quotedTarget}) relative to ${referrer}:`;

	try {
		const filePath = mustResolve(method, target, specifier, referrer);
		if (filePath !== undefined) {
			if (bundleDependencies.includes(specifier)) bundleDependency(filePath);
			return mustLoad(logBase, method, target, specifier, filePath);
		}
	} catch (e) {
		debuglog(logBase, "error:", e);
	}

	return new Response(null, { status: 404 });
}
