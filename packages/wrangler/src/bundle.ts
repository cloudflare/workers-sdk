import assert from "node:assert";
import * as fs from "node:fs";
import { builtinModules } from "node:module";
import * as path from "node:path";
import NodeGlobalsPolyfills from "@esbuild-plugins/node-globals-polyfill";
import NodeModulesPolyfills from "@esbuild-plugins/node-modules-polyfill";
import * as esbuild from "esbuild";
import tmp from "tmp-promise";
import createModuleCollector from "./module-collection";
import { getBasePath, toUrlPath } from "./paths";
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
		betaD1Shims?: string[];
		jsxFactory: string | undefined;
		jsxFragment: string | undefined;
		rules: Config["rules"];
		watch?: esbuild.WatchMode;
		tsconfig: string | undefined;
		minify: boolean | undefined;
		nodeCompat: boolean | undefined;
		define: Config["define"];
		checkFetch: boolean;
		services: Config["services"] | undefined;
		workerDefinitions: WorkerRegistry | undefined;
		firstPartyWorkerDevFacade: boolean | undefined;
		targetConsumer: "dev" | "publish";
		local: boolean;
		testScheduled?: boolean | undefined;
		experimentalLocalStubCache: boolean | undefined;
	}
): Promise<BundleResult> {
	const {
		serveAssetsFromWorker,
		betaD1Shims,
		jsxFactory,
		jsxFragment,
		rules,
		watch,
		tsconfig,
		minify,
		nodeCompat,
		checkFetch,
		local,
		assets,
		workerDefinitions,
		services,
		firstPartyWorkerDevFacade,
		targetConsumer,
		testScheduled,
		experimentalLocalStubCache,
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
			fs.readFileSync(path.resolve(getBasePath(), "templates/checked-fetch.js"))
		);
	}

	// At this point, we take the opportunity to "wrap" any input workers
	// with any extra functionality we may want to add. This is done by
	// passing the entry point through a pipeline of functions that return
	// a new entry point, that we call "middleware" or "facades".
	// Look at implementations of these functions to learn more.

	// We also have middleware that uses a more "traditional" middleware stack,
	// which is all loaded as one in a stack.
	const middlewareToLoad: MiddlewareLoader[] = [];

	if (testScheduled) {
		middlewareToLoad.push({
			path: "templates/middleware/middleware-scheduled.ts",
		});
	}

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

		Array.isArray(betaD1Shims) &&
			betaD1Shims.length > 0 &&
			((currentEntry: Entry) => {
				return applyD1BetaFacade(currentEntry, tmpDir.path, betaD1Shims, local);
			}),

		// Middleware loader: to add middleware, we add the path to the middleware
		// Currently for demonstration purposes we have two example middlewares
		// Middlewares are togglable by changing the `publish` (default=false) and `dev` (default=true) options
		// As we are not yet supporting user created middlewares yet, if no wrangler applied middleware
		// are found, we will not load any middleware. We also need to check if there are middlewares compatible with
		// the target consumer (dev / publish).
		(middlewareToLoad.filter(
			(m) =>
				(m.publish && targetConsumer === "publish") ||
				(m.dev !== false && targetConsumer === "dev")
		).length > 0 ||
			process.env.EXPERIMENTAL_MIDDLEWARE === "true") &&
			((currentEntry: Entry) => {
				return applyMiddlewareLoaderFacade(
					currentEntry,
					tmpDir.path,
					middlewareToLoad.filter(
						// We dynamically filter the middleware depending on where we are bundling for
						(m) =>
							(targetConsumer === "dev" && m.dev !== false) ||
							(m.publish && targetConsumer === "publish")
					),
					moduleCollector.plugin
				);
			}),
	].filter(Boolean);

	let inputEntry = entry;

	for (const middlewareFn of middleware as MiddlewareFn[]) {
		inputEntry = await middlewareFn(inputEntry);
	}

	// At this point, inputEntry points to the entry point we want to build.

	const inject: string[] = [];
	if (checkFetch) inject.push(checkedFetchFileToInject);
	if (experimentalLocalStubCache) {
		inject.push(
			path.resolve(getBasePath(), "templates/experimental-local-cache-stubs.js")
		);
	}

	const result = await esbuild.build({
		entryPoints: [inputEntry.file],
		bundle: true,
		absWorkingDir: entry.directory,
		outdir: destination,
		inject,
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
			// We run the moduleCollector plugin for service workers as part of the middleware loader
			// so we only run here for modules or with no middleware to load
			...(entry.format === "modules" || middlewareToLoad.length === 0
				? [moduleCollector.plugin]
				: []),
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
export function esbuildAliasExternalPlugin(
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
		entryPoints: [
			path.resolve(getBasePath(), "templates/format-dev-errors.ts"),
		],
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
 * A facade that acts as a "middleware loader".
 * Instead of needing to apply a facade for each individual middleware, this allows
 * middleware to be written in a more traditional manner and then be applied all
 * at once, requiring just two esbuild steps, rather than 1 per middleware.
 */

interface MiddlewareLoader {
	path: string;
	// By default all middleware will run on dev, but will not be run when published
	publish?: boolean;
	dev?: boolean;
}

async function applyMiddlewareLoaderFacade(
	entry: Entry,
	tmpDirPath: string,
	middleware: MiddlewareLoader[], // a list of paths to middleware files
	moduleCollectorPlugin: esbuild.Plugin
): Promise<Entry> {
	// Firstly we need to insert the middleware array into the project,
	// and then we load the middleware - this insertion and loading is
	// different for each format.

	// STEP 1: Insert the middleware
	const targetPathInsertion = path.join(
		tmpDirPath,
		"middleware-insertion.entry.js"
	);

	// We need to import each of the middlewares, so we need to generate a
	// random, unique identifier that we can use for the import.
	// Middlewares are required to be default exports so we can import to any name.
	const middlewareIdentifiers = middleware.map(
		(_, index) => `__MIDDLEWARE_${index}__`
	);

	const dynamicFacadePath = path.join(
		tmpDirPath,
		"middleware-insertion-facade.js"
	);

	if (entry.format === "modules") {
		// We use a facade to expose the required middleware alongside any user defined
		// middleware on the worker object

		const imports = middlewareIdentifiers
			.map((m) => `import ${m} from "${m}";`)
			.join("\n");

		// write a file with all of the imports required
		fs.writeFileSync(
			dynamicFacadePath,
			`import worker from "__ENTRY_POINT__";
			${imports}
			const facade = {
				...worker,
				middleware: [
					${middlewareIdentifiers.join(",")}${middlewareIdentifiers.length > 0 ? "," : ""}
					...(worker.middleware ? worker.middleware : []),
				]
			}
			export * from "__ENTRY_POINT__";
			export default facade;`
		);

		await esbuild.build({
			entryPoints: [path.resolve(getBasePath(), dynamicFacadePath)],
			bundle: true,
			sourcemap: true,
			format: "esm",
			plugins: [
				esbuildAliasExternalPlugin({
					__ENTRY_POINT__: entry.file,
					...Object.fromEntries(
						middleware.map((val, index) => [
							middlewareIdentifiers[index],
							toUrlPath(path.resolve(getBasePath(), val.path)),
						])
					),
				}),
			],
			outfile: targetPathInsertion,
		});
	} else {
		// We handle service workers slightly differently as we have to overwrite
		// the event listeners and reimplement them

		await esbuild.build({
			entryPoints: [entry.file],
			bundle: true,
			sourcemap: true,
			define: {
				"process.env.NODE_ENV": `"${process.env["NODE_ENV" + ""]}"`,
			},
			format: "esm",
			outfile: targetPathInsertion,
			plugins: [moduleCollectorPlugin],
		});

		const imports = middlewareIdentifiers
			.map(
				(m, i) =>
					`import ${m} from "${toUrlPath(
						path.resolve(getBasePath(), middleware[i].path)
					)}";`
			)
			.join("\n");

		// We add the new modules with imports and then register using the
		// addMiddleware function (which gets rewritten in the next build step)

		// We choose to run middleware inserted in wrangler before user inserted
		// middleware in the stack
		// To do this, we either need to execute the addMiddleware function first
		// before any user middleware, or use a separate handling function.
		// We choose to do the latter as to prepend, we would have to load the entire
		// script into memory as a prepend function doesn't exist or work in the same
		// way that an append function does.

		fs.copyFileSync(targetPathInsertion, dynamicFacadePath);
		fs.appendFileSync(
			dynamicFacadePath,
			`
			${imports}
			addMiddlewareInternal([${middlewareIdentifiers.join(",")}])
		`
		);
	}

	// STEP 2: Load the middleware
	// We want to get the filename of the orginal entry point
	let targetPathLoader = path.join(tmpDirPath, path.basename(entry.file));
	if (path.extname(entry.file) === "") targetPathLoader += ".js";

	const loaderPath =
		entry.format === "modules"
			? path.resolve(getBasePath(), "templates/middleware/loader-modules.ts")
			: dynamicFacadePath;

	await esbuild.build({
		entryPoints: [loaderPath],
		bundle: true,
		sourcemap: true,
		format: "esm",
		...(entry.format === "service-worker"
			? {
					inject: [
						path.resolve(getBasePath(), "templates/middleware/loader-sw.ts"),
					],
					define: {
						addEventListener: "__facade_addEventListener__",
						removeEventListener: "__facade_removeEventListener__",
						dispatchEvent: "__facade_dispatchEvent__",
						addMiddleware: "__facade_register__",
						addMiddlewareInternal: "__facade_registerInternal__",
					},
			  }
			: {
					plugins: [
						esbuildAliasExternalPlugin({
							__ENTRY_POINT__: targetPathInsertion,
							"./common": path.resolve(
								getBasePath(),
								"templates/middleware/common.ts"
							),
						}),
					],
			  }),
		outfile: targetPathLoader,
	});

	return {
		...entry,
		file: targetPathLoader,
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
			path.resolve(getBasePath(), "templates/serve-static-assets.ts"),
		],
		bundle: true,
		format: "esm",
		sourcemap: true,
		plugins: [
			esbuildAliasExternalPlugin({
				__ENTRY_POINT__: entry.file,
				__KV_ASSET_HANDLER__: path.join(getBasePath(), "kv-asset-handler.js"),
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
	const targetPath = path.join(tmpDirPath, "multiworker-dev-facade.entry.js");
	const serviceMap = Object.fromEntries(
		(services || []).map((serviceBinding) => [
			serviceBinding.binding,
			workerDefinitions[serviceBinding.service] || null,
		])
	);

	await esbuild.build({
		entryPoints: [
			path.join(
				getBasePath(),
				entry.format === "modules"
					? "templates/service-bindings-module-facade.js"
					: "templates/service-bindings-sw-facade.js"
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
				getBasePath(),
				"templates/first-party-worker-module-facade.ts"
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
 * A middleware that injects the beta D1 API in JS.
 *
 * This code be removed from here when the API is in Workers core,
 * but moved inside Miniflare for simulating D1.
 */

async function applyD1BetaFacade(
	entry: Entry,
	tmpDirPath: string,
	betaD1Shims: string[],
	local: boolean
): Promise<Entry> {
	const targetPath = path.join(tmpDirPath, "d1-beta-facade.entry.js");

	await esbuild.build({
		entryPoints: [path.resolve(getBasePath(), "templates/d1-beta-facade.js")],
		bundle: true,
		format: "esm",
		sourcemap: true,
		plugins: [
			esbuildAliasExternalPlugin({
				__ENTRY_POINT__: entry.file,
			}),
		],
		define: {
			__D1_IMPORTS__: JSON.stringify(betaD1Shims),
			__LOCAL_MODE__: JSON.stringify(local),
		},
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
