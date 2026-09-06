import assert from "node:assert";
import fs from "node:fs";
import { createRequire } from "node:module";
import platformPath from "node:path";
import posixPath from "node:path/posix";
import { fileURLToPath, pathToFileURL } from "node:url";
import util from "node:util";
import * as cjsModuleLexer from "cjs-module-lexer";
import * as esModuleLexer from "es-module-lexer";
import { parseModuleFallbackRequest, Response } from "miniflare";
import { workerdBuiltinModules } from "../shared/builtin-modules";
import { ENCODED_PATH_PREFIX } from "../shared/module-path";
import { isFileNotFoundError } from "./helpers";
import type {
	Request,
	V2ModuleFallbackRequest,
	Worker_Module,
} from "miniflare";
import type { Vite } from "vitest/node";

let debuglog: util.DebugLoggerFunction = util.debuglog(
	"vitest-plugin:module-fallback",
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

type LegacyModuleRuleType =
	| "ESModule"
	| "CommonJS"
	| "Text"
	| "Data"
	| "CompiledWasm"
	| "PythonModule"
	| "PythonRequirement";
const legacyModuleRuleTypes: LegacyModuleRuleType[] = [
	"ESModule",
	"CommonJS",
	"Text",
	"Data",
	"CompiledWasm",
	"PythonModule",
	"PythonRequirement",
];
// RegExp for path suffix to force loading WebAssembly modules as workerd modules.
// (e.g. `/path/to/module.wasm?mf_vitest_force=CompiledWasm`)
const forceModuleTypeRegexp = new RegExp(
	`\\?mf_vitest_force=(${legacyModuleRuleTypes.join("|")})$`
);

function isFile(filePath: string): boolean {
	return fs.statSync(filePath, { throwIfNoEntry: false })?.isFile() ?? false;
}

function isDirectory(filePath: string): boolean {
	return (
		fs.statSync(filePath, { throwIfNoEntry: false })?.isDirectory() ?? false
	);
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
	vite: Vite.ViteDevServer,
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
			seen.add(resolved);
			const resolvedNames = await getCjsNamedExports(
				vite,
				resolved,
				resolvedContents,
				seen
			);
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

// Extensions that Node's `require()` probes automatically but `workerd` won't.
// ESM `import` requires explicit extensions; Vite's resolver handles those.
const requireExtensions = [".js", ".mjs", ".cjs", ".json"];
function maybeGetTargetFilePath(
	target: string,
	isRequire: boolean
): string | undefined {
	// Can't use `fs.existsSync()` here as `target` could be a directory
	// (e.g. `node:fs` and `node:fs/promises`)
	if (isFile(target)) {
		return target;
	}
	if (isRequire) {
		for (const extension of requireExtensions) {
			const targetWithExtension = target + extension;
			if (fs.existsSync(targetWithExtension)) {
				return targetWithExtension;
			}
		}
	}
	if (target.endsWith(disableCjsEsmShimSuffix)) {
		return target;
	}
	if (isDirectory(target)) {
		return maybeGetTargetFilePath(target + "/index", isRequire);
	}
}

// Specifiers `workerd` resolves at the modules root rather than relative to the
// referrer, and strips the leading `/` from before asking the fallback service
// about them.
const prefixedSpecifierRegExp = /^(node|cloudflare|workerd):/;

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
	if (prefixedSpecifierRegExp.test(target)) {
		return target;
	}
	return posixPath.relative(referrerDir, target);
}

async function viteResolve(
	vite: Vite.ViteDevServer,
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
		// This will potentially load one of the Node.js polyfills provided by `vitest-plugin`
		// Note: User imports should never get here! This is only meant to cater for Vitest internals
		//       (Specifically, the "tinyrainbow" module imports `node:tty` as `tty`)
		return id;
	}

	return trimViteVersionHash(resolved.id);
}

const wasmModuleSuffix = ".wasm?module";
// Workerd can request the `?module` adapter under the underlying WASM file's
// normalised URL. Give the native module a distinct internal URL to avoid a cycle.
const v2CompiledWasmPathSuffix = ".__mf_vitest_compiled_wasm";

type ResolveMethod = "import" | "require";
async function resolve(
	vite: Vite.ViteDevServer,
	method: ResolveMethod,
	target: string,
	specifier: string,
	referrer: string
): Promise<string /* filePath */> {
	const referrerDir = posixPath.dirname(referrer);

	const isRequire = method === "require";
	// The ?module suffix must be stripped to resolve to the actual wasm file.
	// Only CommonJS `require()` needs to handle these imports dynamically.
	if (isRequire && target.endsWith(wasmModuleSuffix)) {
		target = trimSuffix("?module", target);
	}

	let filePath = maybeGetTargetFilePath(target, isRequire);
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
	//
	// Careful: `workerd` roots prefixed specifiers itself, so this "redirect to
	// the root" is frequently a no-op that points straight back at the specifier
	// `workerd` is already resolving. `load()` detects that case and reports the
	// module as missing instead, because redirecting crashes `workerd`. See the
	// comment on `UnavailableBuiltinModuleError`.
	if (referrerDir !== "/" && workerdBuiltinModules.has(specifier)) {
		return `/${specifier}`;
	}

	const specifierLibPath = posixPath.join(
		libPath,
		specifier.replaceAll(":", "/")
	);
	// Always probe extensions for pool-internal lib modules
	filePath = maybeGetTargetFilePath(specifierLibPath, /* isRequire */ true);
	if (filePath !== undefined) {
		return filePath;
	}

	return viteResolve(vite, specifier, referrer, method === "require");
}

// `workerd` resolves a non-prefixed specifier by joining it to the referrer's
// parent directory via `kj::Path::eval`, which only anchors to the root when
// the path starts with `/`. On Windows, a platform path like `C:/a/b/c` would
// otherwise be appended to the referrer dir; prepending `/` produces
// `/C:/a/b/c`, which workerd resolves as intended.
function ensureRootedPath(filePath: string) {
	return isWindows && filePath[0] !== "/" ? `/${filePath}` : filePath;
}

// Non-printable-ASCII detector. Anything outside the printable ASCII range
// (`0x20`–`0x7E`) can't be represented in the Latin-1/ASCII byte range an HTTP
// header value is restricted to, so it must be percent-encoded before being
// used as a `Location`. The `u` flag makes the class match by code point, so
// astral characters (e.g. emoji, CJK extension chars) are handled as a unit
// rather than as lone surrogates.
const nonHeaderSafeRegExp = /[^\x20-\x7E]/u;

/**
 * Percent-encodes a redirect target so it's safe to use as a `Location` header
 * value, but *only* when it actually contains bytes outside the printable ASCII
 * range. Pure-ASCII paths — the overwhelmingly common case, including paths
 * containing a literal `%` or spaces — are returned unchanged and never gain the
 * sentinel prefix, so this is a no-op for them.
 *
 * When encoding is required, literal `%` is escaped first (to `%25`) so the
 * transform is losslessly reversible by `decodeURIComponent()` even for real
 * paths that already contain percent sequences (e.g. `…/開発/50%off/…`). `/` and
 * `:` are left intact so Windows drive-letter paths like `/C:/a/b/c` still
 * round-trip. `encodeURI()`/`decodeURI()` can't be used here because they don't
 * escape a literal `%`, so a path mixing non-ASCII and `%` wouldn't round-trip.
 * See https://github.com/cloudflare/workers-sdk/issues/14655
 */
export function encodeRedirectLocation(filePath: string): string {
	if (!nonHeaderSafeRegExp.test(filePath)) {
		return filePath;
	}
	const encoded = filePath
		.replace(/%/g, "%25")
		.replace(/[^\x20-\x7E]/gu, (char) => encodeURIComponent(char));
	return `${ENCODED_PATH_PREFIX}${encoded}`;
}

/**
 * Inverts `encodeRedirectLocation()`. `workerd` echoes a redirect's `Location`
 * value back to us verbatim as the next request's `specifier`/`referrer`, so
 * this recovers the real filesystem path — but only for values we actually
 * encoded, identified unambiguously by the sentinel prefix. Everything else
 * (bare `cloudflare:*`/`node:*` specifiers, original file paths, and paths
 * containing a literal `%` we never touched such as `50%off`) is returned
 * untouched. Because we only ever decode our own output, `decodeURIComponent()`
 * can't throw here and can't silently corrupt a real `%` in a workspace path.
 * See https://github.com/cloudflare/workers-sdk/issues/14655
 */
export function decodeEncodedSpecifier(value: string): string {
	if (!value.startsWith(ENCODED_PATH_PREFIX)) {
		return value;
	}
	return decodeURIComponent(value.slice(ENCODED_PATH_PREFIX.length));
}

function buildRedirectResponse(filePath: string) {
	return new Response(null, {
		status: 301,
		headers: { Location: encodeRedirectLocation(ensureRootedPath(filePath)) },
	});
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
	const type = match[1] as LegacyModuleRuleType;
	return loadForcedModuleContents(filePath, type);
}

/** Loads a file using an explicitly selected Workerd module type. */
function loadForcedModuleContents(
	filePath: string,
	type: LegacyModuleRuleType
): ModuleContents {
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
			return { obsoletePythonRequirement: contents.toString() };
		default: {
			// `type` should've been validated against `LegacyModuleRuleType`
			const exhaustive: never = type;
			assert.fail(`Unreachable: ${exhaustive} modules are unsupported`);
		}
	}
}

/** Classifies and reads a JavaScript or JSON module from the filesystem. */
function loadJavaScriptOrJsonModule(
	filePath: string
):
	| { kind: "json"; contents: string }
	| { kind: "esm"; contents: string }
	| { kind: "cjs"; contents: string } {
	if (filePath.endsWith(".json")) {
		return { kind: "json", contents: fs.readFileSync(filePath, "utf8") };
	}
	const contents = fs.readFileSync(filePath, "utf8");
	const isEsm =
		filePath.endsWith(".mjs") ||
		(filePath.endsWith(".js") && isWithinTypeModuleContext(filePath));
	return { kind: isEsm ? "esm" : "cjs", contents };
}
// `name` must exactly match the literal `specifier` string `workerd` sent for
// this request (see the `rawTarget` comment in `handleModuleFallbackRequest()`
// for why this can differ from the decoded `target` used for filesystem
// resolution elsewhere in this file).
function buildModuleResponse(name: string, contents: ModuleContents) {
	if (!isWindows) {
		name = posixPath.relative("/", name);
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

/**
 * Thrown when a `node:*`/`cloudflare:*`/`workerd:*` builtin isn't provided by
 * the `workerd` the Worker under test is running on, so there is nothing we can
 * serve for it.
 *
 * `workerd` resolves prefixed specifiers at the modules root rather than
 * relative to the referrer (`kj::Path::parse(spec)` in `jsg/modules.c++`), and
 * strips the leading `/` before asking us about them. A redirect to
 * `/${target}` therefore points straight back at the specifier `workerd` is
 * already resolving. Its module registry caches that redirect and re-enters
 * resolution with the identical path, with no self-redirect check and no
 * recursion bound, so it recurses until the stack overflows — killing the
 * runtime with `*** Received signal #11: Segmentation fault` and no indication
 * of which module was at fault.
 *
 * Reporting the module as missing instead lets `workerd` raise its own
 * `No such module "<specifier>"`, which is what `wrangler dev` does for the
 * same Worker. This is safe because `workerd` only consults the fallback
 * service *after* its own registry misses: any builtin that reaches us is, by
 * definition, not available at this Worker's compatibility date and flags.
 *
 * See https://github.com/cloudflare/workers-sdk/issues/14590
 */
class UnavailableBuiltinModuleError extends Error {
	constructor(specifier: string) {
		super(`No such module "${specifier}"`);
		this.name = "UnavailableBuiltinModuleError";
	}
}

async function load(
	vite: Vite.ViteDevServer,
	logBase: string,
	method: ResolveMethod,
	target: string,
	rawTarget: string,
	specifier: string,
	filePath: string
): Promise<Response> {
	// Expose wasm?module imports with a thin CommonJS wrapper that exports
	// the wasm file as the default export. This matches the expected structure
	// of wasm?module imports. Only CommonJS `require()` needs to handle these
	// imports dynamically.
	if (
		method === "require" &&
		target.endsWith(wasmModuleSuffix) &&
		filePath.endsWith(".wasm")
	) {
		const wrapper = `module.exports = { default: require(${JSON.stringify(ensureRootedPath(filePath))}) };`;
		debuglog(logBase, "wasm-module-wrapper:", filePath);
		return buildModuleResponse(rawTarget, { commonJsModule: wrapper });
	}

	// A redirect whose only difference from `target` is the leading slash that
	// `workerd` strips from prefixed specifiers would send `workerd` back to the
	// specifier it is already resolving, crashing it. Report the builtin as
	// missing instead. See `UnavailableBuiltinModuleError`.
	if (prefixedSpecifierRegExp.test(target) && filePath === `/${target}`) {
		throw new UnavailableBuiltinModuleError(target);
	}

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
		return buildModuleResponse(rawTarget, maybeContents);
	}

	// If we're importing from a shim module, don't shim again
	const disableCjsEsmShim = filePath.endsWith(disableCjsEsmShimSuffix);
	if (disableCjsEsmShim) {
		filePath = trimSuffix(disableCjsEsmShimSuffix, filePath);
	}

	// JSON modules: CommonJS `require("./data.json")` is common in many widely
	// used packages (e.g. mime-types). If we return raw JSON as a `commonJsModule`,
	// `workerd` will try to parse it as JavaScript and fail with
	// `SyntaxError: Unexpected token ':'`.
	const module = loadJavaScriptOrJsonModule(filePath);
	if (module.kind === "json") {
		debuglog(logBase, "json:", filePath);
		return buildModuleResponse(rawTarget, { json: module.contents });
	}

	let contents = module.contents;
	const targetUrl = pathToFileURL(target);
	contents = withSourceUrl(contents, targetUrl);

	if (module.kind === "esm") {
		// Respond with ES module
		contents = withImportMetaUrl(contents, targetUrl);
		debuglog(logBase, "esm:", filePath);
		return buildModuleResponse(rawTarget, { esModule: contents });
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
		return buildModuleResponse(rawTarget, { esModule });
	}

	// Otherwise, if we're `require`ing a non-`node:*` module, just return a
	// CommonJS
	debuglog(logBase, "cjs:", filePath);
	return buildModuleResponse(rawTarget, { commonJsModule: contents });
}

/** Dispatches module fallback requests using Workerd's selected protocol. */
export async function handleModuleFallbackRequest(
	vite: Vite.ViteDevServer,
	request: Request
): Promise<Response> {
	const parsed = await parseModuleFallbackRequest(request);
	if (parsed === null) {
		return new Response("Invalid module fallback request", { status: 400 });
	}
	return parsed.protocol === "v1"
		? handleV1ModuleFallbackRequest(vite, request)
		: handleV2ModuleFallbackRequest(vite, parsed);
}

/** Handles the legacy V1 fallback protocol. */
async function handleV1ModuleFallbackRequest(
	vite: Vite.ViteDevServer,
	request: Request
): Promise<Response> {
	const method = request.headers.get("X-Resolve-Method");
	assert(method === "import" || method === "require");
	const url = new URL(request.url);
	const rawSpecifierParam = url.searchParams.get("specifier");
	let referrer = url.searchParams.get("referrer");
	assert(rawSpecifierParam !== null, "Expected specifier search param");
	assert(referrer !== null, "Expected referrer search param");
	// `workerd` carries a previous redirect response's `Location` header value
	// through verbatim as this request's `specifier`, rather than URI-decoding
	// it. `buildRedirectResponse()` percent-encodes paths that aren't header-safe
	// (required, since headers are restricted to the Latin-1/ASCII byte range) and
	// tags them with a sentinel prefix, so `decodeEncodedSpecifier()` recovers the
	// real filesystem path for exactly those values and leaves everything else
	// (bare `cloudflare:*` specifiers, untouched original paths, paths with a
	// literal `%`) alone.
	// See https://github.com/cloudflare/workers-sdk/issues/14655
	let target = decodeEncodedSpecifier(rawSpecifierParam);
	// `workerd` also tracks this in-flight module request by the exact literal
	// `specifier` string above (before decoding), and rejects our response if the
	// JSON module's `name` field doesn't match that literal string exactly. So we
	// keep this raw (still percent-encoded where applicable) value around
	// separately, and use it only when building the response's `name` field,
	// while `target` (decoded) is used for all actual filesystem resolution.
	let rawTarget = rawSpecifierParam;
	// Since a module's `name` (above) must stay raw/encoded, that encoded value
	// becomes the referrer workerd sends for every import statement inside that
	// module, propagating the encoding forward indefinitely. Decode it the same
	// way as `target` so filesystem resolution keeps working for those imports.
	referrer = decodeEncodedSpecifier(referrer);
	const referrerDir = posixPath.dirname(referrer);
	let specifier = getApproximateSpecifier(target, referrerDir);

	// Convert specifiers like `file:/a/index.mjs` to `/a/index.mjs`. `workerd`
	// currently passes `import("file:///a/index.mjs")` through like this.
	// TODO(soon): remove this code once the new modules refactor lands
	if (specifier.startsWith("file:")) {
		specifier = fileURLToPath(specifier);
	}

	// When the raw specifier is a `file://` URL (e.g. from vitest's dynamic
	// imports using `import.meta.url`), workerd may double-encode spaces in the
	// resolved `specifier` (%20 → %2520). Use the raw specifier to recover the
	// correct filesystem path for resolution. We override `specifier` (not
	// `target`) so that `buildModuleResponse` still uses the original module name
	// that workerd expects, and the mismatch triggers a redirect.
	// See https://github.com/cloudflare/workers-sdk/issues/14107
	const rawSpecifier = url.searchParams.get("rawSpecifier");
	if (rawSpecifier?.startsWith("file:")) {
		specifier = ensurePosixLikePath(fileURLToPath(rawSpecifier));
	}

	if (isWindows) {
		// Convert paths like `/C:/a/index.mjs` to `C:/a/index.mjs` so they can be
		// passed to Node `fs` functions.
		if (target[0] === "/") {
			target = target.substring(1);
		}
		if (rawTarget[0] === "/") {
			rawTarget = rawTarget.substring(1);
		}
		if (referrer[0] === "/") {
			referrer = referrer.substring(1);
		}
	}

	const quotedTarget = JSON.stringify(target);
	const logBase = `${method}(${quotedTarget}) relative to ${referrer}:`;

	try {
		const filePath = await resolve(vite, method, target, specifier, referrer);

		return await load(
			vite,
			logBase,
			method,
			target,
			rawTarget,
			specifier,
			filePath
		);
	} catch (e) {
		debuglog(logBase, "error:", e);
		if (e instanceof UnavailableBuiltinModuleError) {
			// Bundling can't help here — the module is built into `workerd` and
			// simply isn't switched on for this Worker.
			console.error(
				`[vitest-plugin] ${JSON.stringify(target)}, ${method === "import" ? "imported" : "required"} from ${JSON.stringify(referrer)}, is not available at this Worker's compatibility date and flags.`,
				"To resolve this, enable the compatibility flag that provides it (`nodejs_compat` for `node:*` modules), or remove the import.",
				"For more details, refer to https://developers.cloudflare.com/workers/configuration/compatibility-flags/"
			);
		} else {
			console.error(
				`[vitest-plugin] Failed to ${method} ${JSON.stringify(target)} from ${JSON.stringify(referrer)}.`,
				"To resolve this, try bundling the relevant dependency with Vite.",
				"For more details, refer to https://developers.cloudflare.com/workers/testing/vitest-integration/known-issues/#module-resolution"
			);
		}
	}

	return new Response(null, { status: 404 });
}

// Workerd uses `internal` when the runtime resolves a module directly, such as
// the Worker entrypoint, rather than resolving an import or require expression.
type V2ResolveMethod = ResolveMethod | "internal";

type V2ModulePath = {
	filePath: string;
	search: string;
	hash: string;
};

type V2LoadedModule = {
	contents: ModuleContents;
	namedExports?: Iterable<string>;
};

// Workerd loads these modules before Vitest's Vite module runner exists. Their
// imports overlap with modules later loaded through Vite, but Workerd identifies
// instances by module name. Canonicalise imports reachable from these entry
// points so the native and Vite-resolved paths share Vitest's stateful modules
// instead of creating separate instances.
const vitestNativeEntrySpecifiers = new Set([
	"vitest/worker",
	"cloudflare:snapshot",
]);
const v2VitestModulePaths = new WeakMap<Vite.ViteDevServer, Set<string>>();

/** Resolves a V2 request to a local module path. */
async function resolveV2(
	vite: Vite.ViteDevServer,
	method: V2ResolveMethod,
	target: V2ModulePath,
	specifier: string,
	referrer: V2ModulePath
): Promise<V2ModulePath> {
	const isRequire = method === "require";
	// `?module` requests an adapter around the underlying WebAssembly file.
	const resolvedTarget =
		isRequire && target.search === "?module"
			? { ...target, search: "" }
			: target;
	if (resolvedTarget.filePath.endsWith(v2CompiledWasmPathSuffix)) {
		const wasmPath = trimSuffix(
			v2CompiledWasmPathSuffix,
			resolvedTarget.filePath
		);
		if (isFile(wasmPath)) {
			return resolvedTarget;
		}
	}

	let filePath = maybeGetTargetFilePath(resolvedTarget.filePath, isRequire);
	if (filePath !== undefined) {
		return { ...resolvedTarget, filePath };
	}

	const specifierLibPath = posixPath.join(
		libPath,
		specifier.replaceAll(":", "/")
	);
	filePath = maybeGetTargetFilePath(specifierLibPath, /* isRequire */ true);
	if (filePath !== undefined) {
		return { filePath, search: "", hash: "" };
	}

	const resolved = await viteResolve(
		vite,
		specifier,
		modulePathToViteId(referrer),
		method === "require"
	);
	if (/^\/?(node|cloudflare|workerd):/.test(resolved)) {
		throw new Error("Not found");
	}
	return viteIdToModulePath(resolved);
}

/** Converts a Workerd module URL into a target suitable for Vite resolution. */
function moduleUrlToResolutionTarget(specifier: string): V2ModulePath {
	const url = new URL(specifier);
	if (url.protocol !== "file:") {
		return viteIdToModulePath(specifier);
	}
	// Workerd uses root-anchored file URLs such as `file:///bundle/index.mjs`
	// for its logical module namespace. These are valid module URLs, but Node's
	// Windows fileURLToPath() rejects them because they don't contain a drive.
	const isWindowsFilePath = /^\/[a-zA-Z]:\//.test(url.pathname);
	const filePath =
		isWindows && url.host === "" && !isWindowsFilePath
			? decodeURIComponent(url.pathname)
			: ensurePosixLikePath(fileURLToPath(url));
	return {
		filePath: decodeEncodedSpecifier(filePath),
		search: url.search,
		hash: url.hash,
	};
}

/** Separates Vite ID query and fragment syntax from its filesystem path. */
function viteIdToModulePath(modulePath: string): V2ModulePath {
	const queryIndex = modulePath.indexOf("?");
	const hashIndex = modulePath.indexOf("#");
	const pathEnd = Math.min(
		queryIndex === -1 ? modulePath.length : queryIndex,
		hashIndex === -1 ? modulePath.length : hashIndex
	);
	const searchEnd = hashIndex === -1 ? modulePath.length : hashIndex;
	return {
		filePath: modulePath.slice(0, pathEnd),
		search:
			queryIndex === -1 || queryIndex > searchEnd
				? ""
				: modulePath.slice(queryIndex, searchEnd),
		hash: hashIndex === -1 ? "" : modulePath.slice(hashIndex),
	};
}

/** Converts a structured V2 module path into a Vite module ID. */
function modulePathToViteId(modulePath: V2ModulePath): string {
	return modulePath.filePath + modulePath.search + modulePath.hash;
}

/** Converts a structured local module path into its canonical module URL. */
function pathToModuleUrl(modulePath: V2ModulePath): string {
	return (
		pathToFileURL(modulePath.filePath).href +
		modulePath.search +
		modulePath.hash
	);
}

/** Reads Vite's private module-type marker without making it module identity. */
function getV2ForcedModuleType(
	modulePath: V2ModulePath
): LegacyModuleRuleType | undefined {
	const match = /^\?mf_vitest_force=(.+)$/.exec(modulePath.search);
	if (
		match === null ||
		!legacyModuleRuleTypes.includes(match[1] as LegacyModuleRuleType)
	) {
		return;
	}
	return match[1] as LegacyModuleRuleType;
}

/** Checks for Vite's `?module` WebAssembly adapter request. */
function isV2WasmModuleSpecifier(modulePath: V2ModulePath): boolean {
	return (
		modulePath.filePath.endsWith(".wasm") && modulePath.search === "?module"
	);
}

/** Builds the JSON response expected by Workerd's V2 fallback protocol. */
function buildV2ModuleResponse(
	name: string,
	contents: ModuleContents,
	namedExports?: Iterable<string>
): Response {
	const result: Record<string, unknown> = { name };
	for (const key in contents) {
		const value = (contents as Record<string, unknown>)[key];
		result[key] = value instanceof Uint8Array ? Array.from(value) : value;
	}
	if (namedExports !== undefined) {
		result.namedExports = Array.from(namedExports);
	}
	return Response.json(result);
}

/** Loads a resolved path using Workerd's native V2 module types. */
async function loadV2Module(
	vite: Vite.ViteDevServer,
	logBase: string,
	method: V2ResolveMethod,
	specifier: string,
	modulePath: V2ModulePath
): Promise<V2LoadedModule> {
	const { filePath } = modulePath;
	if (filePath.endsWith(v2CompiledWasmPathSuffix)) {
		const wasmPath = trimSuffix(v2CompiledWasmPathSuffix, filePath);
		debuglog(logBase, "wasm:", wasmPath);
		return { contents: { wasm: fs.readFileSync(wasmPath) } };
	}

	if (
		method === "require" &&
		isV2WasmModuleSpecifier(viteIdToModulePath(specifier)) &&
		filePath.endsWith(".wasm")
	) {
		// Workerd normalises `*.wasm?module` to this wrapper's file URL. Use a
		// distinct internal URL for the native module so it doesn't import itself.
		const moduleSpecifier = JSON.stringify(
			pathToModuleUrl({
				filePath: filePath + v2CompiledWasmPathSuffix,
				search: "",
				hash: "",
			})
		);
		const wrapper = `import wasm from ${moduleSpecifier}; export default wasm;`;
		debuglog(logBase, "wasm-module-wrapper:", filePath);
		return { contents: { esModule: wrapper } };
	}

	const forcedType =
		getV2ForcedModuleType(modulePath) ??
		getV2ForcedModuleType(viteIdToModulePath(specifier));
	if (forcedType !== undefined) {
		const ruleContents = loadForcedModuleContents(filePath, forcedType);
		debuglog(logBase, "forced:", forcedType, filePath);
		if ("commonJsModule" in ruleContents) {
			return {
				contents: ruleContents,
				namedExports: await getCjsNamedExports(
					vite,
					filePath,
					ruleContents.commonJsModule
				),
			};
		}
		return { contents: ruleContents };
	}

	if (filePath.endsWith(".wasm")) {
		const contents = loadForcedModuleContents(filePath, "CompiledWasm");
		debuglog(logBase, "forced:", filePath);
		return { contents };
	}

	const module = loadJavaScriptOrJsonModule(filePath);
	if (module.kind === "json") {
		debuglog(logBase, "json:", filePath);
		return { contents: { json: module.contents } };
	}

	if (module.kind === "esm") {
		debuglog(logBase, "esm:", filePath);
		return { contents: { esModule: module.contents } };
	}

	debuglog(logBase, "cjs:", filePath);
	const namedExports = await getCjsNamedExports(
		vite,
		filePath,
		module.contents
	);
	return { contents: { commonJsModule: module.contents }, namedExports };
}

/** Recovers the source import specifier from a V2 fallback request. */
function getV2RequestSpecifier(
	request: V2ModuleFallbackRequest,
	target: V2ModulePath,
	referrer: V2ModulePath
): string {
	let specifier = request.rawSpecifier;
	if (specifier?.startsWith("file:")) {
		const rawModulePath = moduleUrlToResolutionTarget(specifier);
		if (rawModulePath.filePath.startsWith("/bundle/")) {
			rawModulePath.filePath = rawModulePath.filePath.slice("/bundle/".length);
		}
		specifier = modulePathToViteId(rawModulePath);
	}
	return (
		specifier ??
		modulePathToViteId({
			...target,
			filePath: getApproximateSpecifier(
				target.filePath,
				posixPath.dirname(referrer.filePath)
			),
		})
	);
}

/** Handles a parsed V2 fallback request. */
async function handleV2ModuleFallbackRequest(
	vite: Vite.ViteDevServer,
	request: V2ModuleFallbackRequest
): Promise<Response> {
	if (request.referrer === undefined) {
		return new Response("Invalid module fallback request", { status: 400 });
	}

	let vitestModulePaths = v2VitestModulePaths.get(vite);
	if (vitestModulePaths === undefined) {
		vitestModulePaths = new Set();
		v2VitestModulePaths.set(vite, vitestModulePaths);
	}
	const target = moduleUrlToResolutionTarget(request.specifier);
	const referrer = moduleUrlToResolutionTarget(request.referrer);
	const specifier = getV2RequestSpecifier(request, target, referrer);
	const logBase = `${request.type}(${JSON.stringify(modulePathToViteId(target))}) relative to ${modulePathToViteId(referrer)}:`;

	try {
		const modulePath = await resolveV2(
			vite,
			request.type,
			target,
			specifier,
			referrer
		);
		const canonicalSpecifier = pathToModuleUrl(modulePath);
		if (
			vitestNativeEntrySpecifiers.has(specifier) ||
			vitestModulePaths.has(request.referrer)
		) {
			vitestModulePaths.add(canonicalSpecifier);
		}
		if (canonicalSpecifier !== request.specifier) {
			debuglog(logBase, "redirect:", canonicalSpecifier);
			return new Response(null, {
				status: 301,
				headers: { Location: canonicalSpecifier },
			});
		}
		const module = await loadV2Module(
			vite,
			logBase,
			request.type,
			specifier,
			modulePath
		);
		if (
			"esModule" in module.contents &&
			vitestModulePaths.has(canonicalSpecifier)
		) {
			module.contents.esModule = await linkV2VitestModule(
				vite,
				module.contents.esModule,
				modulePath,
				vitestModulePaths
			);
		}
		return buildV2ModuleResponse(
			request.specifier,
			module.contents,
			module.namedExports
		);
	} catch (error) {
		debuglog(logBase, "error:", error);
		console.error(
			`[vitest-plugin] Failed to ${request.type} ${JSON.stringify(modulePathToViteId(target))} from ${JSON.stringify(modulePathToViteId(referrer))}.`,
			"To resolve this, try bundling the relevant dependency with Vite.",
			"For more details, refer to https://developers.cloudflare.com/workers/testing/vitest-integration/known-issues/#module-resolution"
		);
		return new Response(null, { status: 404 });
	}
}

/**
 * Links Vitest's native bootstrap graph to canonical module URLs so its shared
 * state is instantiated once. User modules are left for Workerd to resolve.
 */
async function linkV2VitestModule(
	vite: Vite.ViteDevServer,
	contents: string,
	modulePath: V2ModulePath,
	vitestModulePaths: Set<string>
): Promise<string> {
	await esModuleLexer.init;
	const [imports] = esModuleLexer.parse(contents);
	for (let i = imports.length - 1; i >= 0; i--) {
		const imported = imports[i];
		const specifier = imported.n;
		if (specifier === undefined || /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(specifier)) {
			continue;
		}

		let resolved: string;
		try {
			resolved = await viteResolve(
				vite,
				specifier,
				modulePathToViteId(modulePath),
				/* isRequire */ false
			);
		} catch {
			continue;
		}
		if (/^\/?(node|cloudflare|workerd):/.test(resolved)) {
			continue;
		}

		const resolvedModulePath = viteIdToModulePath(resolved);
		const canonicalSpecifier = pathToModuleUrl(resolvedModulePath);
		vitestModulePaths.add(canonicalSpecifier);
		const replacement =
			imported.d === -1
				? canonicalSpecifier
				: JSON.stringify(canonicalSpecifier);
		contents =
			contents.slice(0, imported.s) + replacement + contents.slice(imported.e);
	}
	return contents;
}
