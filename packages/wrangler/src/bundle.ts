import assert from "node:assert";
import * as fs from "node:fs";
import { builtinModules } from "node:module";
import * as path from "node:path";
import NodeGlobalsPolyfills from "@esbuild-plugins/node-globals-polyfill";
import NodeModulesPolyfills from "@esbuild-plugins/node-modules-polyfill";
import * as esbuild from "esbuild";
import tmp from "tmp-promise";
import createModuleCollector from "./module-collection";
import type { Config } from "./config";
import type { WorkerRegistry } from "./dev-registry";
import type { Entry } from "./entry";
import type { CfModule } from "./worker";

type BundleResult = {
	modules: CfModule[];
	resolvedEntryPointPath: string;
	bundleType: "esm" | "commonjs";
	stop: (() => void) | undefined;
	sourceMapPath?: string | undefined;
};

type StaticAssetsConfig =
	| (Config["assets"] & {
			bypassCache: boolean | undefined;
	  })
	| undefined;

/**
 * Searches for any uses of node's builtin modules, and throws an error if it
 * finds anything. This plugin is only used when nodeCompat is not enabled.
 * Supports both regular node builtins, and the new "node:<MODULE>" format.
 */
const checkForNodeBuiltinsPlugin = {
	name: "checkForNodeBuiltins",
	setup(build: esbuild.PluginBuild) {
		build.onResolve(
			{
				filter: new RegExp(
					"^(" +
						builtinModules.join("|") +
						"|" +
						builtinModules.map((module) => "node:" + module).join("|") +
						")$"
				),
			},
			() => {
				throw new Error(
					`Detected a Node builtin module import while Node compatibility is disabled.\nAdd node_compat = true to your wrangler.toml file to enable Node compatibility.`
				);
			}
		);
	},
};

/**
 * Generate a bundle for the worker identified by the arguments passed in.
 */
export async function bundleWorker(
	entry: Entry,
	destination: string,
	options: {
		serveAssetsFromWorker: boolean;
		assets: StaticAssetsConfig;
		jsxFactory: string | undefined;
		jsxFragment: string | undefined;
		rules: Config["rules"];
		watch?: esbuild.WatchMode;
		tsconfig: string | undefined;
		minify: boolean | undefined;
		nodeCompat: boolean | undefined;
		define: Config["define"];
		checkFetch: boolean;
		services: Config["services"];
		workerDefinitions: WorkerRegistry | undefined;
		firstPartyWorkerDevFacade: boolean | undefined;
	}
): Promise<BundleResult> {
	const {
		serveAssetsFromWorker,
		jsxFactory,
		jsxFragment,
		rules,
		watch,
		tsconfig,
		minify,
		nodeCompat,
		checkFetch,
		assets,
		workerDefinitions,
		services,
		firstPartyWorkerDevFacade,
	} = options;

	// We create a temporary directory for any oneoff files we
	// need to create. This is separate from the main build
	// directory (`destination`).
	const tmpDir = await tmp.dir({ unsafeCleanup: true });

	const entryDirectory = path.dirname(entry.file);
	const moduleCollector = createModuleCollector({
		wrangler1xlegacyModuleReferences: {
			rootDirectory: entryDirectory,
			fileNames: new Set(
				fs
					.readdirSync(entryDirectory, { withFileTypes: true })
					.filter(
						(dirEntry) =>
							dirEntry.isFile() && dirEntry.name !== path.basename(entry.file)
					)
					.map((dirEnt) => dirEnt.name)
			),
		},
		format: entry.format,
		rules,
	});

	// In dev, we want to patch `fetch()` with a special version that looks
	// for bad usages and can warn the user about them; so we inject
	// `checked-fetch.js` to do so. However, with yarn 3 style pnp,
	// we need to extract that file to an accessible place before injecting
	// it in, hence this code here.

	const checkedFetchFileToInject = path.join(tmpDir.path, "checked-fetch.js");

	if (checkFetch && !fs.existsSync(checkedFetchFileToInject)) {
		fs.mkdirSync(tmpDir.path, {
			recursive: true,
		});
		fs.writeFileSync(
			checkedFetchFileToInject,
			fs.readFileSync(path.resolve(__dirname, "../templates/checked-fetch.js"))
		);
	}

	// At this point, we take the opportunity to "wrap" any input workers
	// with any extra functionality we may want to add. This is done by
	// passing the entry point through a pipeline of functions that return
	// a new entry point, that we call "middleware" or "facades".
	// Look at implementations of these functions to learn more.

	type MiddlewareFn = (arg0: Entry) => Promise<Entry>;
	const middleware: (false | undefined | MiddlewareFn)[] = [
		// serve static assets
		serveAssetsFromWorker &&
			((currentEntry: Entry) => {
				return applyStaticAssetFacade(currentEntry, tmpDir.path, assets);
			}),
		// format errors nicely
		// We use an env var here because we don't actually
		// want to expose this to the user. It's only used internally to
		// experiment with middleware as a teaching exercise.
		process.env.FORMAT_WRANGLER_ERRORS === "true" &&
			((currentEntry: Entry) => {
				return applyFormatDevErrorsFacade(currentEntry, tmpDir.path);
			}),
		// bind to other dev instances/service bindings
		workerDefinitions &&
			Object.keys(workerDefinitions).length > 0 &&
			services &&
			services.length > 0 &&
			((currentEntry: Entry) => {
				return applyMultiWorkerDevFacade(
					currentEntry,
					tmpDir.path,
					services,
					workerDefinitions
				);
			}),
		// Simulate internal environment when using first party workers in dev
		firstPartyWorkerDevFacade === true &&
			((currentEntry: Entry) => {
				return applyFirstPartyWorkerDevFacade(currentEntry, tmpDir.path);
			}),
	].filter(Boolean);

	let inputEntry = entry;

	for (const middlewareFn of middleware as MiddlewareFn[]) {
		inputEntry = await middlewareFn(inputEntry);
	}

	// At this point, inputEntry points to the entry point we want to build.

	const result = await esbuild.build({
		entryPoints: [inputEntry.file],
		bundle: true,
		absWorkingDir: entry.directory,
		outdir: destination,
		inject: checkFetch ? [checkedFetchFileToInject] : [],
		external: ["__STATIC_CONTENT_MANIFEST"],
		format: entry.format === "modules" ? "esm" : "iife",
		target: "es2020",
		sourcemap: true,
		// Include a reference to the output folder in the sourcemap.
		// This is omitted by default, but we need it to properly resolve source paths in error output.
		sourceRoot: destination,
		minify,
		metafile: true,
		conditions: ["worker", "browser"],
		...(process.env.NODE_ENV && {
			define: {
				// use process.env["NODE_ENV" + ""] so that esbuild doesn't replace it
				// when we do a build of wrangler. (re: https://github.com/cloudflare/wrangler2/issues/1477)
				"process.env.NODE_ENV": `"${process.env["NODE_ENV" + ""]}"`,
				...(nodeCompat ? { global: "globalThis" } : {}),
				...(checkFetch ? { fetch: "checkedFetch" } : {}),
				...options.define,
			},
		}),
		loader: {
			".js": "jsx",
			".mjs": "jsx",
			".cjs": "jsx",
		},
		plugins: [
			moduleCollector.plugin,
			...(nodeCompat
				? [NodeGlobalsPolyfills({ buffer: true }), NodeModulesPolyfills()]
				: // we use checkForNodeBuiltinsPlugin to throw a nicer error
				  // if we find node builtins when nodeCompat isn't turned on
				  [checkForNodeBuiltinsPlugin]),
		],
		...(jsxFactory && { jsxFactory }),
		...(jsxFragment && { jsxFragment }),
		...(tsconfig && { tsconfig }),
		watch,
	});

	const entryPointOutputs = Object.entries(result.metafile.outputs).filter(
		([_path, output]) => output.entryPoint !== undefined
	);
	assert(
		entryPointOutputs.length > 0,
		`Cannot find entry-point "${entry.file}" in generated bundle.` +
			listEntryPoints(entryPointOutputs)
	);
	assert(
		entryPointOutputs.length < 2,
		"More than one entry-point found for generated bundle." +
			listEntryPoints(entryPointOutputs)
	);

	const entryPointExports = entryPointOutputs[0][1].exports;
	const bundleType = entryPointExports.length > 0 ? "esm" : "commonjs";

	const sourceMapPath = Object.keys(result.metafile.outputs).filter((_path) =>
		_path.includes(".map")
	)[0];

	return {
		modules: moduleCollector.modules,
		resolvedEntryPointPath: path.resolve(
			entry.directory,
			entryPointOutputs[0][0]
		),
		bundleType,
		stop: result.stop,
		sourceMapPath,
	};
}

/**
 * A simple plugin to alias modules and mark them as external
 */
function esbuildAliasExternalPlugin(
	aliases: Record<string, string>
): esbuild.Plugin {
	return {
		name: "alias",
		setup(build) {
			build.onResolve({ filter: /.*/g }, (args) => {
				// If it's the entrypoint, let it be as is
				if (args.kind === "entry-point") {
					return {
						path: args.path,
					};
				}
				// If it's not a recognised alias, then throw an error
				if (!Object.keys(aliases).includes(args.path)) {
					throw new Error("unrecognized module: " + args.path);
				}

				// Otherwise, return the alias
				return {
					path: aliases[args.path as keyof typeof aliases],
					external: true,
				};
			});
		},
	};
}

/**
 * A middleware that catches any thrown errors, and instead formats
 * them to be rendered in a browser. This middleware is for demonstration
 * purposes only, and is not intended to be used in production (or even dev!)
 */
async function applyFormatDevErrorsFacade(
	entry: Entry,
	tmpDirPath: string
): Promise<Entry> {
	const targetPath = path.join(tmpDirPath, "format-dev-errors.entry.js");
	await esbuild.build({
		entryPoints: [path.resolve(__dirname, "../templates/format-dev-errors.ts")],
		bundle: true,
		sourcemap: true,
		format: "esm",
		plugins: [
			esbuildAliasExternalPlugin({
				__ENTRY_POINT__: entry.file,
			}),
		],
		outfile: targetPath,
	});

	return {
		...entry,
		file: targetPath,
	};
}

/**
 * A middleware that serves static assets from a worker.
 * This powers --assets / config.assets
 */

async function applyStaticAssetFacade(
	entry: Entry,
	tmpDirPath: string,
	assets: StaticAssetsConfig
): Promise<Entry> {
	const targetPath = path.join(tmpDirPath, "serve-static-assets.entry.js");

	await esbuild.build({
		entryPoints: [
			path.resolve(__dirname, "../templates/serve-static-assets.ts"),
		],
		bundle: true,
		format: "esm",
		sourcemap: true,
		plugins: [
			esbuildAliasExternalPlugin({
				__ENTRY_POINT__: entry.file,
				__KV_ASSET_HANDLER__: path.join(__dirname, "../kv-asset-handler.js"),
				__STATIC_CONTENT_MANIFEST: "__STATIC_CONTENT_MANIFEST",
			}),
		],
		define: {
			__CACHE_CONTROL_OPTIONS__: JSON.stringify(
				typeof assets === "object"
					? {
							browserTTL:
								assets.browser_TTL || 172800 /* 2 days: 2* 60 * 60 * 24 */,
							bypassCache: assets.bypassCache,
					  }
					: {}
			),
			__SERVE_SINGLE_PAGE_APP__: JSON.stringify(
				typeof assets === "object" ? assets.serve_single_page_app : false
			),
		},
		outfile: targetPath,
	});

	return {
		...entry,
		file: targetPath,
	};
}

/**
 * A middleware that enables service bindings to be used in dev,
 * binding to other love wrangler dev instances
 */

async function applyMultiWorkerDevFacade(
	entry: Entry,
	tmpDirPath: string,
	services: Config["services"],
	workerDefinitions: WorkerRegistry
) {
	const targetPath = path.join(tmpDirPath, "serve-static-assets.entry.js");
	const serviceMap = Object.fromEntries(
		(services || []).map((serviceBinding) => [
			serviceBinding.binding,
			workerDefinitions[serviceBinding.service] || null,
		])
	);

	await esbuild.build({
		entryPoints: [
			path.join(
				__dirname,
				entry.format === "modules"
					? "../templates/service-bindings-module-facade.js"
					: "../templates/service-bindings-sw-facade.js"
			),
		],
		bundle: true,
		sourcemap: true,
		format: "esm",
		plugins: [
			esbuildAliasExternalPlugin({
				__ENTRY_POINT__: entry.file,
			}),
		],
		define: {
			__WORKERS__: JSON.stringify(serviceMap),
		},
		outfile: targetPath,
	});

	return {
		...entry,
		file: targetPath,
	};
}

/**
 * A middleware that makes first party workers "work" in
 * our dev environments. Is applied during wrangler dev
 * when config.first_party_worker is true
 */
async function applyFirstPartyWorkerDevFacade(
	entry: Entry,
	tmpDirPath: string
) {
	if (entry.format !== "modules") {
		throw new Error(
			"First party workers must be in the modules format. See https://developers.cloudflare.com/workers/learning/migrating-to-module-workers/"
		);
	}

	const targetPath = path.join(
		tmpDirPath,
		"first-party-worker-module-facade.entry.js"
	);

	await esbuild.build({
		entryPoints: [
			path.resolve(
				__dirname,
				"../templates/first-party-worker-module-facade.ts"
			),
		],
		bundle: true,
		format: "esm",
		sourcemap: true,
		plugins: [
			esbuildAliasExternalPlugin({
				__ENTRY_POINT__: entry.file,
			}),
		],
		outfile: targetPath,
	});

	return {
		...entry,
		file: targetPath,
	};
}

/**
 * Generate a string that describes the entry-points that were identified by esbuild.
 */
function listEntryPoints(
	outputs: [string, ValueOf<esbuild.Metafile["outputs"]>][]
): string {
	return outputs.map(([_input, output]) => output.entryPoint).join("\n");
}

type ValueOf<T> = T[keyof T];
