import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { getWorkerBundleDir } from "@cloudflare/build-output-utils";
import {
	getWasmInitModule,
	hasNodeJsAls,
	isNodeAlsModule,
	matchAdditionalModule,
	moduleRuleFilters,
	toModuleType,
	wasmInitRE,
} from "@cloudflare/workers-dev-shared";
import { rspack } from "@rsbuild/core";
import type { ModuleType } from "@cloudflare/config";
import type { NodeJsCompat, Worker } from "@cloudflare/workers-dev-shared";
import type { EnvironmentConfig, Rspack } from "@rsbuild/core";
import type { WorkerOptions } from "miniflare";

/** The package export conditions that the Vite plugin uses for Workers. */
const conditionNames = ["workerd", "worker", "module", "browser"];

/** The Worker's entry chunk name, so its main module is `index.js`. */
export const WORKER_ENTRY_NAME = "index";

/**
 * Builds the Rsbuild environment config that bundles a Worker for workerd as
 * a single ES module entry (plus any dynamically imported chunks).
 *
 * @param worker The resolved Worker.
 * @param root The project root.
 * @returns An Rsbuild environment config.
 */
export function getWorkerEnvironmentConfig(
	worker: Worker,
	root: string
): EnvironmentConfig {
	const { config, directoryName, nodeJsCompat } = worker;
	/** The additional modules to emit, keyed by output file name. */
	const additionalModules = new Map<
		string,
		{ filePath: string; type: ModuleType }
	>();

	return {
		source: { entry: getWorkerEntry(worker, root) },
		resolve: {
			conditionNames,
			// As in the Vite plugin, don't prefer packages' browser builds.
			mainFields: ["module", "jsnext:main", "jsnext", "main"],
		},
		output: {
			target: "web-worker",
			module: true,
			distPath: {
				root: getWorkerBundleDir(root, directoryName),
				js: "",
				jsAsync: "",
			},
			filename: { js: "[name].js" },
			filenameHash: false,
			// As in the Vite plugin, source maps are written to the bundle rather
			// than the public assets, so emit them for readable stack traces.
			sourceMap: { js: "source-map" },
			// Like the Vite plugin and Wrangler, don't minify the Worker, which also
			// keeps license comments in the deployed modules.
			minify: false,
			externals: [
				async ({ request = "", context = "", dependencyType, getResolve }) => {
					const nodeRequest = request.startsWith("node:")
						? request
						: `node:${request}`;
					if (request.startsWith("cloudflare:")) {
						return `module ${request}`;
					}
					if (
						nodeJsCompat?.externals.has(nodeRequest) ||
						(hasNodeJsAls(config) && isNodeAlsModule(request))
					) {
						// `require()` returns a built-in module's default export, as in
						// Node.js, rather than its namespace.
						return dependencyType === "commonjs"
							? [`module ${nodeRequest}`, "default"]
							: `module ${nodeRequest}`;
					}
					// As in the Vite plugin, imports that resolve to `.wasm`, `.bin`,
					// `.txt`, `.html` or `.sql` files become Worker modules.
					if (getResolve && moduleRuleFilters.some((re) => re.test(request))) {
						const resolved = await getResolve()(context, request);
						const type = resolved && matchAdditionalModule(resolved);
						if (resolved && type) {
							const filePath = resolved.replace(/\?.*$/, "");
							const { name, ext } = path.parse(filePath);
							const hash = createHash("sha256")
								.update(await fsp.readFile(filePath))
								.digest("hex")
								.slice(0, 8);
							const fileName = `${name}-${hash}${ext}`;
							additionalModules.set(fileName, {
								filePath,
								type: toModuleType(type),
							});
							return `module ${createModuleReference(fileName)}`;
						}
					}
				},
			],
		},
		performance: { chunkSplit: { strategy: "all-in-one" } },
		dev: { hmr: false, liveReload: false },
		tools: {
			// workerd runs the latest syntax, so don't lower it for the browser
			// targets. Rsbuild drops its browserslist `env` when `jsc.target` is set.
			swc: { jsc: { target: "esnext" } },
			rspack: {
				// Keep the entry's exports, which are the Worker's handlers.
				output: { library: { type: "module" } },
				resolve: {
					aliasFields: [],
					// As in the Vite plugin, `import` or `require` depends on how the
					// module is imported.
					byDependency: {
						esm: { conditionNames: [...conditionNames, "import"] },
						commonjs: { conditionNames: [...conditionNames, "require"] },
					},
				},
				// Like Vite, allow ES modules to import names that a CommonJS module
				// doesn't export (they are `undefined`), as some packages do.
				module: { parser: { javascript: { exportsPresence: "warn" } } },
				plugins: [
					...(nodeJsCompat ? [nodeJsCompatPlugin(nodeJsCompat)] : []),
					wasmInitPlugin(),
					additionalModulesPlugin(additionalModules),
				],
			},
		},
	};
}

/**
 * Gets the Worker environment's entry, which imports the Node.js compat globals
 * before the Worker when they're needed.
 *
 * @param worker The resolved Worker.
 * @param root The project root.
 * @returns The Rsbuild entry config.
 */
export function getWorkerEntry(
	{ config, nodeJsCompat }: Worker,
	root: string
): NonNullable<NonNullable<EnvironmentConfig["source"]>["entry"]> {
	// As in Vite, the entrypoint is a path relative to the root, or else a
	// module specifier (e.g. a package export).
	const entrypointPath = path.resolve(root, config.entrypoint);
	const entrypoint = fs.existsSync(entrypointPath)
		? entrypointPath
		: config.entrypoint;

	return {
		[WORKER_ENTRY_NAME]: {
			import: nodeJsCompat
				? [toDataUri(nodeJsCompat.injectGlobalCode()), entrypoint]
				: entrypoint,
			html: false,
		},
	};
}

/**
 * Applies the shared Node.js compat aliases and global injections. Requests
 * are rewritten before resolution because rspack rejects `node:` specifiers
 * before `resolve.alias` is applied, and because the polyfills must be resolved
 * from this package rather than the user's project.
 */
function nodeJsCompatPlugin(
	nodeJsCompat: NodeJsCompat
): Rspack.RspackPluginInstance {
	return new rspack.NormalModuleReplacementPlugin(/^[^./]/, (resource) => {
		const virtualModule = nodeJsCompat.getGlobalVirtualModule(resource.request);
		resource.request =
			virtualModule !== undefined
				? toDataUri(virtualModule)
				: (nodeJsCompat.resolveNodeJsImport(resource.request)?.resolved ??
					resource.request);
	});
}

/** Supports `.wasm?init` imports, as in the Vite plugin. */
function wasmInitPlugin(): Rspack.RspackPluginInstance {
	return new rspack.NormalModuleReplacementPlugin(wasmInitRE, (resource) => {
		const wasmPath = resource.request.replace(/\?init$/, "");
		resource.request = toDataUri(
			getWasmInitModule(
				// The data URI module can't resolve paths relative to the importer.
				wasmPath.startsWith(".")
					? path.resolve(resource.context, wasmPath).replaceAll("\\", "/")
					: wasmPath
			)
		);
	});
}

/**
 * Emits the additional modules that were externalized, and points the chunks'
 * imports of them at their paths relative to each chunk.
 */
function additionalModulesPlugin(
	additionalModules: Map<string, { filePath: string; type: ModuleType }>
): Rspack.RspackPluginInstance {
	const name = "rsbuild:cloudflare-additional-modules";
	return {
		apply(compiler) {
			compiler.hooks.thisCompilation.tap(name, (compilation) => {
				compilation.hooks.processAssets.tapPromise(
					{
						name,
						stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL,
					},
					async () => {
						for (const [fileName, { filePath, type }] of additionalModules) {
							compilation.emitAsset(
								fileName,
								new compiler.webpack.sources.RawSource(
									await fsp.readFile(filePath)
								),
								{ [MODULE_TYPE_KEY]: type }
							);
							compilation.fileDependencies.add(filePath);
						}
						for (const { name: chunkName, source } of compilation.getAssets()) {
							const code = source.source().toString();
							if (!/\.m?js$/.test(chunkName) || !moduleReferenceRE.test(code)) {
								continue;
							}
							// Keeps the chunk's source map, which is generated later.
							const replaced = new compiler.webpack.sources.ReplaceSource(
								source
							);
							for (const match of code.matchAll(moduleReferenceGlobalRE)) {
								const [reference, fileName = ""] = match;
								const relativePath = path.posix.relative(
									path.posix.dirname(chunkName),
									fileName
								);
								replaced.replace(
									match.index,
									match.index + reference.length - 1,
									relativePath.startsWith(".")
										? relativePath
										: `./${relativePath}`
								);
							}
							compilation.updateAsset(chunkName, replaced);
						}
					}
				);
			});
		},
	};
}

const MODULE_REFERENCE_PATTERN =
	"__CLOUDFLARE_MODULE__(.*?)__CLOUDFLARE_MODULE__";
const moduleReferenceRE = new RegExp(MODULE_REFERENCE_PATTERN);
const moduleReferenceGlobalRE = new RegExp(MODULE_REFERENCE_PATTERN, "g");

/** A placeholder for an additional module's path, as chunk paths aren't known yet. */
function createModuleReference(fileName: string): string {
	return `__CLOUDFLARE_MODULE__${fileName}__CLOUDFLARE_MODULE__`;
}

function toDataUri(code: string): string {
	return `data:text/javascript,${encodeURIComponent(code)}`;
}

type ManifestModules = NonNullable<
	WorkerOptions["config"]["manifest"]
>["modules"];

/**
 * Collects the modules emitted for a Worker into a Miniflare module manifest.
 * Source maps are included, so that Miniflare can source-map stack traces
 * without reading them from disk.
 *
 * @param compilation The Worker environment's compilation.
 * @returns The main module name and every emitted module.
 */
export function getManifestFromCompilation(compilation: Rspack.Compilation): {
	mainModule: string;
	modules: ManifestModules;
} {
	const modules: ManifestModules = {};
	for (const asset of compilation.getAssets()) {
		const type = getModuleType(asset);
		if (type) {
			const contents = asset.source.buffer();
			modules[asset.name] = {
				type,
				contents:
					type === "wasm" || type === "data"
						? new Uint8Array(contents)
						: contents.toString(),
			};
		}
	}

	const entryChunk = compilation.entrypoints
		.get(WORKER_ENTRY_NAME)
		?.getEntrypointChunk();
	const mainModule = [...(entryChunk?.files ?? [])].find(
		(file) => getModuleType({ name: file, info: {} }) === "esm"
	);
	if (!mainModule) {
		throw new Error("The Worker's entry chunk wasn't emitted.");
	}

	return { mainModule, modules };
}

/**
 * Selects the modules that a partial Build Output manifest must list, which
 * are those whose type can't be inferred from their extension.
 *
 * @param modules The Worker's Miniflare manifest modules.
 * @returns The additional modules and their types.
 */
export function getAdditionalModuleTypes(
	modules: ManifestModules = {}
): Record<string, { type: ModuleType }> {
	return Object.fromEntries(
		Object.entries(modules)
			.filter(([, { type }]) => type !== "esm" && type !== "sourcemap")
			.map(([name, { type }]) => [name, { type }])
	);
}

/**
 * Lists the other assets that the Worker imports (e.g. images), which are
 * served as static assets rather than loaded as modules.
 *
 * @param compilation The Worker environment's compilation.
 * @returns The assets' paths relative to the output directory.
 */
export function getImportedAssetPaths(
	compilation: Rspack.Compilation
): string[] {
	return compilation
		.getAssets()
		.filter((asset) => getModuleType(asset) === undefined)
		.map(({ name }) => name);
}

/** Records an emitted additional module's type in its asset info. */
const MODULE_TYPE_KEY = "cloudflareModuleType";

function getModuleType({
	name,
	info,
}: Pick<Rspack.Asset, "name" | "info">): ModuleType | undefined {
	if (/\.m?js$/.test(name)) {
		return "esm";
	}
	if (name.endsWith(".map")) {
		return "sourcemap";
	}
	return info[MODULE_TYPE_KEY];
}

/**
 * Removes files from the Worker's output directory that the compilation didn't
 * emit, so that the Build Output's inferred modules are exactly the Worker's.
 * Rsbuild copies `public/` into every non-Node environment, and watch rebuilds
 * leave stale chunks behind.
 *
 * @param distPath The Worker environment's output directory.
 * @param compilation The Worker environment's compilation.
 */
export async function removeUnemittedFiles(
	distPath: string,
	compilation: Rspack.Compilation
): Promise<void> {
	const emitted = new Set(
		compilation.getAssets().map(({ name }) => path.join(distPath, name))
	);
	const entries = await fsp.readdir(distPath, {
		recursive: true,
		withFileTypes: true,
	});
	await Promise.all(
		entries
			.map((entry) => path.join(entry.parentPath, entry.name))
			.filter((file, index) => entries[index]?.isFile() && !emitted.has(file))
			.map((file) => fsp.rm(file))
	);
}
