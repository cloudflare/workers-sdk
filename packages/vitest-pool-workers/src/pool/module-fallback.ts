import assert from "node:assert";
import fs from "node:fs";
import { createRequire } from "node:module";
import platformPath from "node:path";
import posixPath from "node:path/posix";
import { fileURLToPath, pathToFileURL } from "node:url";
import util from "node:util";
import * as cjsModuleLexer from "cjs-module-lexer";
import { ModuleRuleTypeSchema, Response } from "miniflare";
import { workerdBuiltinModules } from "../shared/builtin-modules";
import { isFileNotFoundError } from "./helpers";
import type { ModuleRuleType, Request, Worker_Module } from "miniflare";
import type { ViteDevServer } from "vite";

let debuglog: util.DebugLoggerFunction = util.debuglog(
	"vitest-pool-workers:module-fallback",
	(log) => (debuglog = log)
);

const isWindows = process.platform === "win32";

// Ensures `filePath` uses forward-slashes. Note this doesn't prepend a
// forward-slash in front of Windows paths, so they can still be passed to Node
// `fs` functions.
export function ensurePosixLikePath(filePath: string) {
	return isWindows ? filePath.replaceAll("\\", "/") : filePath;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = platformPath.dirname(__filename);
const require = createRequire(__filename);

const distPath = ensurePosixLikePath(platformPath.resolve(__dirname, ".."));
const libPath = posixPath.join(distPath, "worker", "lib");
const emptyLibPath = posixPath.join(libPath, "cloudflare/empty-internal.cjs");

// File path suffix to disable CJS to ESM-with-named-exports shimming
const disableCjsEsmShimSuffix = "?mf_vitest_no_cjs_esm_shim";
function trimSuffix(suffix: string, value: string) {
	assert(value.endsWith(suffix));
	return value.substring(0, value.length - suffix.length);
}

/**
 * When pre-bundling is enabled, Vite will add a hash to the end of the file path
 * e.g. `/node_modules/.vite/deps/my-dep.js?v=f3sf2ebd`
 *
 * @see https://vite.dev/guide/features.html#npm-dependency-resolving-and-pre-bundling
 * @see https://github.com/cloudflare/workers-sdk/pull/5673
 */
const versionHashRegExp = /\?v=[0-9a-f]+$/;

function trimViteVersionHash(filePath: string) {
	return filePath.replace(versionHashRegExp, "");
}

// RegExp for path suffix to force loading module as specific type.
// (e.g. `/path/to/module.wasm?mf_vitest_force=CompiledWasm`)
// This suffix will be added by the pool when fetching a module that matches a
// module rule. In this case, the module will be marked as external with this
// suffix, causing the fallback service to return a module with the correct
// type. Note we can't easily implement rules with a Vite plugin, as they:
// - Depend on `miniflare`/`wrangler` configuration, and we can't modify the
//   Vite config in the pool
// - Would require use of an `UnsafeEval` binding to build `WebAssembly.Module`s
const forceModuleTypeRegexp = new RegExp(
	`\\?mf_vitest_force=(${ModuleRuleTypeSchema.options.join("|")})$`
);

function isFile(filePath: string): boolean {
	try {
		return fs.statSync(filePath).isFile();
	} catch (e) {
		if (isFileNotFoundError(e)) {
			return false;
		}
		throw e;
	}
}

function isDirectory(filePath: string): boolean {
	try {
		return fs.statSync(filePath).isDirectory();
	} catch (e) {
		if (isFileNotFoundError(e)) {
			return false;
		}
		throw e;
	}
}

function getParentPaths(filePath: string): string[] {
	const parentPaths: string[] = [];

	while (true) {
		const parentPath = posixPath.dirname(filePath);
		if (parentPath === filePath) {
			return parentPaths;
		}
		parentPaths.push(parentPath);
		filePath = parentPath;
	}
}

const dirPathTypeModuleCache = new Map<string, boolean>();
function isWithinTypeModuleContext(filePath: string): boolean {
	const parentPaths = getParentPaths(filePath);

	for (const parentPath of parentPaths) {
		const cache = dirPathTypeModuleCache.get(parentPath);
		if (cache !== undefined) {
			return cache;
		}
	}

	for (const parentPath of parentPaths) {
		try {
			const pkgPath = posixPath.join(parentPath, "package.json");
			const pkgJson = fs.readFileSync(pkgPath, "utf8");
			const pkg = JSON.parse(pkgJson);
			const maybeModulePath = pkg.module
				? posixPath.join(parentPath, pkg.module)
				: "";
			const cache = pkg.type === "module" || maybeModulePath === filePath;
			dirPathTypeModuleCache.set(parentPath, cache);
			return cache;
		} catch (e: unknown) {
			if (!isFileNotFoundError(e)) {
				throw e;
			}
		}
	}

	return false;
}

await cjsModuleLexer.init();
/**
 * Gets "named" exports from a CommonJS module. Normally, CommonJS modules can
 * only be default-imported, but Node performs additional static analysis to
 * allow named-imports too (https://nodejs.org/api/esm.html#interoperability-with-commonjs).
 * This function returns the named-exports we should add to our ESM-CJS shim,
 * using the same package as Node.
 */
async function getCjsNamedExports(
	vite: ViteDevServer,
	filePath: string,
	contents: string,
	seen = new Set()
): Promise<Set<string>> {
	const { exports, reexports } = cjsModuleLexer.parse(contents);
	const result = new Set(exports);
	for (const reexport of reexports) {
		const resolved = await viteResolve(
			vite,
			reexport,
			filePath,
			/* isRequire */ true
		);
		if (seen.has(resolved)) {
			continue;
		}
		try {
			const resolvedContents = fs.readFileSync(resolved, "utf8");
			seen.add(filePath);
			const resolvedNames = await getCjsNamedExports(
				vite,
				resolved,
				resolvedContents,
				seen
			);
			seen.delete(filePath);
			for (const name of resolvedNames) {
				result.add(name);
			}
		} catch (e) {
			if (!isFileNotFoundError(e)) {
				throw e;
			}
		}
	}
	result.delete("default");
	result.delete("__esModule");
	return result;
}

function withSourceUrl(contents: string, url: string | URL): string {
	// If we've already got a `//# sourceURL` comment, return `script` as is
	// (searching from the end as that's where we'd expect it)
	if (contents.lastIndexOf("//# sourceURL=") !== -1) {
		return contents;
	}
	// Make sure `//# sourceURL` comment is on its own line
	const sourceURL = `\n//# sourceURL=${url.toString()}\n`;
	return contents + sourceURL;
}

function withImportMetaUrl(contents: string, url: string | URL): string {
	// TODO(soon): this isn't perfect, ideally need `workerd` support
	return contents.replaceAll("import.meta.url", JSON.stringify(url.toString()));
}

// Extensions `workerd` won't resolve automatically, but Node.js will.
// Note: `.json` is especially important for CommonJS `require()` chains.
const moduleExtensions = [".js", ".mjs", ".cjs", ".json"];
function maybeGetTargetFilePath(target: string): string | undefined {
	// Can't use `fs.existsSync()` here as `target` could be a directory
	// (e.g. `node:fs` and `node:fs/promises`)
	if (isFile(target)) {
		return target;
	}
	for (const extension of moduleExtensions) {
		const targetWithExtension = target + extension;
		if (fs.existsSync(targetWithExtension)) {
			return targetWithExtension;
		}
	}
	if (target.endsWith(disableCjsEsmShimSuffix)) {
		return target;
	}
	if (isDirectory(target)) {
		return maybeGetTargetFilePath(target + "/index");
	}
}

/**
 * `target` is the path to the "file" `workerd` is trying to load,
 * `referrer` is the path to the file that imported/required the `target`,
 * `referrerDir` is the dirname of `referrer`
 *
 * For example, if the `referrer` is "/a/b/c/index.mjs":
 *
 * | Import Statement            | `target`           | Return             |
 * |-----------------------------|--------------------|--------------------|
 * | import "./dep.mjs"          | /a/b/c/dep.mjs     | dep.mjs            |
 * | import "../dep.mjs"         | /a/b/dep.mjs       | ../dep.mjs         |
 * | import "pkg"                | /a/b/c/pkg         | pkg                |
 * | import "@org/pkg"           | /a/b/c/@org/pkg    | @org/pkg           |
 * | import "node:assert"        | node:assert        | node:assert        |
 * | import "cloudflare:sockets" | cloudflare:sockets | cloudflare:sockets |
 * | import "workerd:rtti"       | workerd:rtti       | workerd:rtti       |
 * | import "random:pkg"         | /a/b/c/random:pkg  | random:pkg         |
 *
 * Note that we return `dep.mjs` for `import "./dep.mjs"`. This would fail
 * ES module resolution, so must be handled by `maybeGetTargetFilePath()`.
 */
function getApproximateSpecifier(target: string, referrerDir: string): string {
	if (/^(node|cloudflare|workerd):/.test(target)) {
		return target;
	}
	return posixPath.relative(referrerDir, target);
}

async function viteResolve(
	vite: ViteDevServer,
	specifier: string,
	referrer: string,
	isRequire: boolean
): Promise<string> {
	const resolved = await vite.pluginContainer.resolveId(specifier, referrer, {
		ssr: true,
		// https://github.com/vitejs/vite/blob/v5.1.4/packages/vite/src/node/plugins/resolve.ts#L178-L179
		custom: { "node-resolve": { isRequire } },
	});
	if (resolved === null) {
		// Vite's resolution algorithm doesn't apply Node resolution to specifiers
		// starting with a dot. Unfortunately, the `@prisma/client` package includes
		// `require(".prisma/client/wasm")` which needs to resolve to something in
		// `node_modules/.prisma/client`. Since Prisma officially supports Workers,
		// it's quite likely users will want to use it with the Vitest pool. To fix
		// this, we fall back to Node's resolution algorithm in this case.
		if (isRequire && specifier[0] === ".") {
			return require.resolve(specifier, { paths: [referrer] });
		}
		throw new Error("Not found");
	}
	// Handle case where `package.json` `browser` field stubs out built-in with an
	// empty module (e.g. `{ "browser": { "fs": false } }`).
	if (resolved.id === "__vite-browser-external") {
		return emptyLibPath;
	}
	if (resolved.external) {
		// Handle case where `node:*` built-in resolved from import map
		// (e.g. https://github.com/sindresorhus/p-limit/blob/f53bdb5f464ae112b2859e834fdebedc0745199b/package.json#L20)
		let { id } = resolved;
		if (workerdBuiltinModules.has(id)) {
			return `/${id}`;
		}
		if (id.startsWith("node:")) {
			throw new Error("Not found");
		}

		id = `node:${id}`;
		if (workerdBuiltinModules.has(id)) {
			return `/${id}`;
		}

		// If we get this far, we have something that:
		//  - looks like a built-in node module but wasn't imported with a `node:` prefix
		//  - and isn't provided by workerd natively
		// In that case, _try_ and load the identifier with a `node:` prefix.
		// This will potentially load one of the Node.js polyfills provided by `vitest-pool-workers`
		// Note: User imports should never get here! This is only meant to cater for Vitest internals
		//       (Specifically, the "tinyrainbow" module imports `node:tty` as `tty`)
		return id;
	}

	return trimViteVersionHash(resolved.id);
}

type ResolveMethod = "import" | "require";
async function resolve(
	vite: ViteDevServer,
	method: ResolveMethod,
	target: string,
	specifier: string,
	referrer: string
): Promise<string /* filePath */> {
	const referrerDir = posixPath.dirname(referrer);

	let filePath = maybeGetTargetFilePath(target);
	if (filePath !== undefined) {
		return filePath;
	}

	// `workerd` will always try to resolve modules relative to the referencing
	// dir first. Built-in `node:*`/`cloudflare:*` imports only exist at the root.
	// We need to ensure we only load a single copy of these modules, therefore,
	// we return a redirect to the root here. Note `workerd` will automatically
	// look in the root if we return 404 from the fallback service when
	// *import*ing `node:*`/`cloudflare:*` modules, but not when *require()*ing
	// them. For the sake of consistency (and a nice return type on this function)
	// we return a redirect for `import`s too.
	if (referrerDir !== "/" && workerdBuiltinModules.has(specifier)) {
		return `/${specifier}`;
	}

	const specifierLibPath = posixPath.join(
		libPath,
		specifier.replaceAll(":", "/")
	);
	filePath = maybeGetTargetFilePath(specifierLibPath);
	if (filePath !== undefined) {
		return filePath;
	}

	return viteResolve(vite, specifier, referrer, method === "require");
}

function buildRedirectResponse(filePath: string) {
	// `workerd` expects an absolute POSIX-style path (starting with a slash) for
	// redirects. `filePath` is a platform absolute path with forward slashes.
	// On Windows, this won't start with a `/`, so we add one to produce paths
	// like `/C:/a/b/c`.
	if (isWindows && filePath[0] !== "/") {
		filePath = `/${filePath}`;
	}
	return new Response(null, { status: 301, headers: { Location: filePath } });
}

// `Omit<Worker_Module, "name">` gives type `{}` which isn't very helpful, so
// we have to do something like this instead.
type DistributeWorkerModuleForContents<T> = T extends unknown
	? { [P in Exclude<keyof T, "name">]: NonNullable<T[P]> }
	: never;
type ModuleContents = DistributeWorkerModuleForContents<Worker_Module>;

// Refer to docs on `forceModuleTypeRegexp` for more details
function maybeGetForceTypeModuleContents(
	filePath: string
): ModuleContents | undefined {
	const match = forceModuleTypeRegexp.exec(filePath);
	if (match === null) {
		return;
	}

	filePath = trimSuffix(match[0], filePath);
	const type = match[1] as ModuleRuleType;
	const contents = fs.readFileSync(filePath);
	switch (type) {
		case "ESModule":
			return { esModule: contents.toString() };
		case "CommonJS":
			return { commonJsModule: contents.toString() };
		case "Text":
			return { text: contents.toString() };
		case "Data":
			return { data: contents };
		case "CompiledWasm":
			return { wasm: contents };
		case "PythonModule":
			return { pythonModule: contents.toString() };
		case "PythonRequirement":
			return { pythonRequirement: contents.toString() };
		default: {
			// `type` should've been validated against `ModuleRuleType`
			const exhaustive: never = type;
			assert.fail(`Unreachable: ${exhaustive} modules are unsupported`);
		}
	}
}
function buildModuleResponse(target: string, contents: ModuleContents) {
	let name = target;
	if (!isWindows) {
		name = posixPath.relative("/", target);
	}
	assert(name[0] !== "/");
	const result: Record<string, unknown> = { name };
	for (const key in contents) {
		const value = (contents as Record<string, unknown>)[key];
		// Cap'n Proto expects byte arrays for `:Data` typed fields from JSON
		result[key] = value instanceof Uint8Array ? Array.from(value) : value;
	}
	return Response.json(result);
}

async function load(
	vite: ViteDevServer,
	logBase: string,
	method: ResolveMethod,
	target: string,
	specifier: string,
	filePath: string
): Promise<Response> {
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

	// If this is a WebAssembly module, force load it as one. This ensures we
	// support `.wasm` files inside `node_modules` (e.g. Prisma's client).
	// It seems unlikely a package would want to do anything else with a `.wasm`
	// file. Note if a module rule was applied to `.wasm` files, this path will
	// have a `?mf_vitest_force` suffix already, so this line won't do anything.
	if (filePath.endsWith(".wasm")) {
		filePath += `?mf_vitest_force=CompiledWasm`;
	}

	// If we're importing with a forced module type, load the file as that type
	const maybeContents = maybeGetForceTypeModuleContents(filePath);
	if (maybeContents !== undefined) {
		debuglog(logBase, "forced:", filePath);
		return buildModuleResponse(target, maybeContents);
	}

	// If we're importing from a shim module, don't shim again
	const disableCjsEsmShim = filePath.endsWith(disableCjsEsmShimSuffix);
	if (disableCjsEsmShim) {
		filePath = trimSuffix(disableCjsEsmShimSuffix, filePath);
	}

	const isEsm =
		filePath.endsWith(".mjs") ||
		(filePath.endsWith(".js") && isWithinTypeModuleContext(filePath));

	// JSON modules: CommonJS `require("./data.json")` is common in many widely
	// used packages (e.g. mime-types). If we return raw JSON as a `commonJsModule`,
	// `workerd` will try to parse it as JavaScript and fail with
	// `SyntaxError: Unexpected token ':'`.
	if (filePath.endsWith(".json")) {
		const json = fs.readFileSync(filePath, "utf8");
		debuglog(logBase, "json:", filePath);
		return buildModuleResponse(target, { json });
	}

	let contents = fs.readFileSync(filePath, "utf8");
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
	// module from a CommonJS, return an ES module shim. Note
	// CommonJS can `require` ES modules, using the default export.
	const insertCjsEsmShim = method === "import" || specifier.startsWith("node:");
	if (insertCjsEsmShim && !disableCjsEsmShim) {
		const fileName = posixPath.basename(filePath);
		const disableShimSpecifier = `./${fileName}${disableCjsEsmShimSuffix}`;
		const quotedDisableShimSpecifier = JSON.stringify(disableShimSpecifier);
		let esModule = `import mod from ${quotedDisableShimSpecifier}; export default mod;`;
		for (const name of await getCjsNamedExports(vite, filePath, contents)) {
			esModule += ` export const ${name} = mod.${name};`;
		}
		debuglog(logBase, "cjs-esm-shim:", filePath);
		return buildModuleResponse(target, { esModule });
	}

	// Otherwise, if we're `require`ing a non-`node:*` module, just return a
	// CommonJS
	debuglog(logBase, "cjs:", filePath);
	return buildModuleResponse(target, { commonJsModule: contents });
}

export async function handleModuleFallbackRequest(
	vite: ViteDevServer,
	request: Request
): Promise<Response> {
	const method = request.headers.get("X-Resolve-Method");
	assert(method === "import" || method === "require");
	const url = new URL(request.url);
	let target = url.searchParams.get("specifier");
	let referrer = url.searchParams.get("referrer");
	assert(target !== null, "Expected specifier search param");
	assert(referrer !== null, "Expected referrer search param");
	const referrerDir = posixPath.dirname(referrer);
	let specifier = getApproximateSpecifier(target, referrerDir);

	// Convert specifiers like `file:/a/index.mjs` to `/a/index.mjs`. `workerd`
	// currently passes `import("file:///a/index.mjs")` through like this.
	// TODO(soon): remove this code once the new modules refactor lands
	if (specifier.startsWith("file:")) {
		specifier = fileURLToPath(specifier);
	}

	if (isWindows) {
		// Convert paths like `/C:/a/index.mjs` to `C:/a/index.mjs` so they can be
		// passed to Node `fs` functions.
		if (target[0] === "/") {
			target = target.substring(1);
		}
		if (referrer[0] === "/") {
			referrer = referrer.substring(1);
		}
	}

	const quotedTarget = JSON.stringify(target);
	const logBase = `${method}(${quotedTarget}) relative to ${referrer}:`;

	try {
		const filePath = await resolve(vite, method, target, specifier, referrer);

		return await load(vite, logBase, method, target, specifier, filePath);
	} catch (e) {
		debuglog(logBase, "error:", e);
		console.error(
			`[vitest-pool-workers] Failed to ${method} ${JSON.stringify(target)} from ${JSON.stringify(referrer)}.`,
			"To resolve this, try bundling the relevant dependency with Vite.",
			"For more details, refer to https://developers.cloudflare.com/workers/testing/vitest-integration/known-issues/#module-resolution"
		);
	}

	return new Response(null, { status: 404 });
}
