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

type ModuleRuleType =
	| "ESModule"
	| "CommonJS"
	| "Text"
	| "Data"
	| "CompiledWasm"
	| "PythonModule"
	| "PythonRequirement";
const moduleRuleTypes: ModuleRuleType[] = [
	"ESModule",
	"CommonJS",
	"Text",
	"Data",
	"CompiledWasm",
	"PythonModule",
	"PythonRequirement",
];
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

// Workerd can request the `?module` adapter under the underlying WASM file's
// normalised URL. Give the native module a distinct internal URL to avoid a cycle.
const v2CompiledWasmPathSuffix = ".__mf_vitest_compiled_wasm";

/**
 * Decodes a file URL marked by `markCreateRequireUrl()`, leaving ordinary file
 * paths untouched.
 */
export function decodeEncodedSpecifier(value: string): string {
	if (!value.startsWith(ENCODED_PATH_PREFIX)) {
		return value;
	}
	return decodeURIComponent(value.slice(ENCODED_PATH_PREFIX.length));
}

// `Omit<Worker_Module, "name">` gives type `{}` which isn't very helpful, so
// we have to do something like this instead.
type DistributeWorkerModuleForContents<T> = T extends unknown
	? { [P in Exclude<keyof T, "name">]: NonNullable<T[P]> }
	: never;
type ModuleContents = DistributeWorkerModuleForContents<Worker_Module>;

/** Loads a file using an explicitly selected Workerd module type. */
function loadForcedModuleContents(
	filePath: string,
	type: ModuleRuleType
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
			// `type` should've been validated against `ModuleRuleType`
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
/** Handles Workerd module fallback requests. */
export async function handleModuleFallbackRequest(
	vite: Vite.ViteDevServer,
	request: Request
): Promise<Response> {
	const parsed = await parseModuleFallbackRequest(request);
	if (parsed === null || parsed.protocol !== "v2") {
		return new Response("Invalid module fallback request", { status: 400 });
	}
	return handleV2ModuleFallbackRequest(vite, parsed);
}

// Workerd uses `internal` when the runtime resolves a module directly, such as
// the Worker entrypoint, rather than resolving an import or require expression.
type V2ResolveMethod = "import" | "require" | "internal";

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
): ModuleRuleType | undefined {
	const match = /^\?mf_vitest_force=(.+)$/.exec(modulePath.search);
	if (match === null || !moduleRuleTypes.includes(match[1] as ModuleRuleType)) {
		return;
	}
	return match[1] as ModuleRuleType;
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
	// Workerd redirects `node:process` to its internal implementation after the
	// fallback service reports that it has no module for the specifier.
	if (request.specifier === "node:process") {
		return new Response();
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
