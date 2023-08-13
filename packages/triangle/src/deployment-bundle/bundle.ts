import * as fs from "node:fs";
import { builtinModules } from "node:module";
import * as path from "node:path";
import NodeGlobalsPolyfills from "@esbuild-plugins/node-globals-polyfill";
import NodeModulesPolyfills from "@esbuild-plugins/node-modules-polyfill";
import * as esbuild from "esbuild";
import tmp from "tmp-promise";
import createModuleCollector from "../module-collection";
import { getBasePath } from "../paths";
import { dedent } from "../utils/dedent";
import { getEntryPointFromMetafile } from "./entry-point-from-metafile";
import { cloudflareInternalPlugin } from "./esbuild-plugins/cloudflare-internal";
import { configProviderPlugin } from "./esbuild-plugins/config-provider";
import { nodejsCompatPlugin } from "./esbuild-plugins/nodejs-compat";
import type { Config } from "../config";
import type { DurableObjectBindings } from "../config/environment";
import type { WorkerRegistry } from "../dev-registry";
import type { SourceMapMetadata } from "../inspect";
import type { ModuleCollector } from "../module-collection";
import type { Entry } from "./entry";
import type { CfModule } from "./worker";

export const COMMON_ESBUILD_OPTIONS = {
	// Our workerd runtime uses the same V8 version as recent Chrome, which is highly ES2022 compliant: https://kangax.github.io/compat-table/es2016plus/
	target: "es2022",
	loader: { ".js": "jsx", ".mjs": "jsx", ".cjs": "jsx" },
} as const;

export type BundleResult = {
	modules: CfModule[];
	dependencies: esbuild.Metafile["outputs"][string]["inputs"];
	resolvedEntryPointPath: string;
	bundleType: "esm" | "commonjs";
	stop: (() => void) | undefined;
	sourceMapPath?: string | undefined;
	sourceMapMetadata?: SourceMapMetadata | undefined;
	moduleCollector: ModuleCollector | undefined;
};

export type StaticAssetsConfig =
	| (Config["assets"] & {
			bypassCache: boolean | undefined;
	  })
	| undefined;

/**
 * When applying the middleware facade for service workers, we need to inject
 * some code at the top of the final output bundle. Applying an inject too early
 * will allow esbuild to reorder the code. Additionally, we need to make sure
 * user code is bundled in the final esbuild step with `watch` correctly
 * configured, so code changes are detected.
 *
 * This type is used as the return type for the `MiddlewareFn` type representing
 * a facade-applying function. Returned injects should be injected with the
 * final esbuild step.
 */
type EntryWithInject = Entry & { inject?: string[] };

/**
 * RegExp matching against esbuild's error text when it is unable to resolve
 * a Node built-in module. If we detect this when node_compat is disabled,
 * we'll rewrite the error to suggest enabling it.
 */
const nodeBuiltinResolveErrorText = new RegExp(
	'^Could not resolve "(' +
		builtinModules.join("|") +
		"|" +
		builtinModules.map((module) => "node:" + module).join("|") +
		')"$'
);

/**
 * Returns true if the passed value looks like an esbuild BuildFailure object
 */
export function isBuildFailure(err: unknown): err is esbuild.BuildFailure {
	return (
		typeof err === "object" &&
		err !== null &&
		"errors" in err &&
		"warnings" in err
	);
}

/**
 * Rewrites esbuild BuildFailures for failing to resolve Node built-in modules
 * to suggest enabling Node compat as opposed to `platform: "node"`.
 */
export function rewriteNodeCompatBuildFailure(
	err: esbuild.BuildFailure,
	forPages = false
) {
	for (const error of err.errors) {
		const match = nodeBuiltinResolveErrorText.exec(error.text);
		if (match !== null) {
			const issue = `The package "${match[1]}" wasn't found on the file system but is built into node.`;

			const instructionForUser = `${
				forPages
					? 'Add the "nodejs_compat" compatibility flag to your Pages project'
					: 'Add "node_compat = true" to your wrangler.toml file'
			} to enable Node.js compatibility.`;

			error.notes = [
				{
					location: null,
					text: `${issue}\n${instructionForUser}`,
				},
			];
		}
	}
}

/**
 * Generate a bundle for the worker identified by the arguments passed in.
 */
export async function bundleWorker(
	entry: Entry,
	destination: string,
	options: {
		// When `bundle` is set to false, we apply shims to the Worker, but won't pull in any imports
		bundle?: boolean;
		serveAssetsFromWorker: boolean;
		assets?: StaticAssetsConfig;
		doBindings: DurableObjectBindings;
		jsxFactory?: string;
		jsxFragment?: string;
		entryName?: string;
		rules: Config["rules"];
		watch?: esbuild.WatchMode | boolean;
		tsconfig?: string;
		minify?: boolean;
		legacyNodeCompat?: boolean;
		nodejsCompat?: boolean;
		define: Config["define"];
		checkFetch: boolean;
		services?: Config["services"];
		workerDefinitions?: WorkerRegistry;
		firstPartyWorkerDevFacade?: boolean;
		targetConsumer: "dev" | "deploy";
		testScheduled?: boolean;
		inject?: string[];
		loader?: Record<string, string>;
		sourcemap?: esbuild.CommonOptions["sourcemap"];
		plugins?: esbuild.Plugin[];
		additionalModules?: CfModule[];
		// TODO: Rip these out https://github.com/cloudflare/workers-sdk/issues/2153
		disableModuleCollection?: boolean;
		isOutfile?: boolean;
		forPages?: boolean;
	}
): Promise<BundleResult> {
	const {
		bundle = true,
		serveAssetsFromWorker,
		doBindings,
		jsxFactory,
		jsxFragment,
		entryName,
		rules,
		watch,
		tsconfig,
		minify,
		legacyNodeCompat,
		nodejsCompat,
		checkFetch,
		assets,
		workerDefinitions,
		services,
		targetConsumer,
		testScheduled,
		inject: injectOption,
		loader,
		sourcemap,
		plugins,
		disableModuleCollection,
		isOutfile,
		forPages,
		additionalModules = [],
	} = options;

	// We create a temporary directory for any one-off files we
	// need to create. This is separate from the main build
	// directory (`destination`).
	const tmpDir = await tmp.dir({ unsafeCleanup: true });

	const entryDirectory = path.dirname(entry.file);
	let moduleCollector = createModuleCollector({
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
	if (disableModuleCollection) {
		moduleCollector = {
			modules: [],
			plugin: {
				name: moduleCollector.plugin.name,
				setup: () => {},
			},
		};
	}

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
	// with any extra functionality we may want to add.
	const middlewareToLoad: MiddlewareLoader[] = [
		{
			name: "scheduled",
			path: "templates/middleware/middleware-scheduled.ts",
			active: targetConsumer === "dev" && !!testScheduled,
		},
		// In Miniflare 3, we bind the user's worker as a service binding in a
		// special entry worker that handles things like injecting `Request.cf`,
		// live-reload, and the pretty-error page.
		//
		// Unfortunately, due to a bug in `workerd`, errors thrown asynchronously by
		// native APIs don't have `stack`s. This means Miniflare can't extract the
		// `stack` trace from dispatching to the user worker service binding by
		// `try/catch`.
		//
		// As a stop-gap solution, if the `MF-Experimental-Error-Stack` header is
		// truthy on responses, the body will be interpreted as a JSON-error of the
		// form `{ message?: string, name?: string, stack?: string }`.
		//
		// This middleware wraps the user's worker in a `try/catch`, and rewrites
		// errors in this format so a pretty-error page can be shown.
		{
			name: "miniflare3-json-error",
			path: "templates/middleware/middleware-miniflare3-json-error.ts",
			active: targetConsumer === "dev",
		},
		{
			name: "serve-static-assets",
			path: "templates/middleware/middleware-serve-static-assets.ts",
			active: serveAssetsFromWorker,
			config: {
				spaMode:
					typeof assets === "object" ? assets.serve_single_page_app : false,
				cacheControl:
					typeof assets === "object"
						? {
								browserTTL:
									assets.browser_TTL || 172800 /* 2 days: 2* 60 * 60 * 24 */,
								bypassCache: assets.bypassCache,
						  }
						: {},
			},
		},
		{
			name: "multiworker-dev",
			path: "templates/middleware/middleware-multiworker-dev.ts",
			active:
				targetConsumer === "dev" &&
				!!(
					workerDefinitions &&
					Object.keys(workerDefinitions).length > 0 &&
					services &&
					services.length > 0
				),
			config: {
				workers: Object.fromEntries(
					(services || []).map((serviceBinding) => [
						serviceBinding.binding,
						workerDefinitions?.[serviceBinding.service] || null,
					])
				),
			},
		},
	];

	const inject: string[] = injectOption ?? [];
	if (checkFetch) inject.push(checkedFetchFileToInject);
	const activeMiddleware = middlewareToLoad.filter(
		// We dynamically filter the middleware depending on where we are bundling for
		(m) => m.active
	);
	let inputEntry: EntryWithInject = entry;
	if (
		activeMiddleware.length > 0 ||
		process.env.EXPERIMENTAL_MIDDLEWARE === "true"
	) {
		inputEntry = await applyMiddlewareLoaderFacade(
			entry,
			tmpDir.path,
			activeMiddleware,
			doBindings
		);
		if (inputEntry.inject !== undefined) inject.push(...inputEntry.inject);
	}

	const buildOptions: esbuild.BuildOptions & { metafile: true } = {
		entryPoints: [inputEntry.file],
		bundle,
		absWorkingDir: entry.directory,
		outdir: destination,
		entryNames: entryName || path.parse(entry.file).name,
		...(isOutfile
			? {
					outdir: undefined,
					outfile: destination,
					entryNames: undefined,
			  }
			: {}),
		inject,
		external: bundle ? ["__STATIC_CONTENT_MANIFEST"] : undefined,
		format: entry.format === "modules" ? "esm" : "iife",
		target: COMMON_ESBUILD_OPTIONS.target,
		sourcemap: sourcemap ?? true,
		// Include a reference to the output folder in the sourcemap.
		// This is omitted by default, but we need it to properly resolve source paths in error output.
		sourceRoot: destination,
		minify,
		metafile: true,
		conditions: ["workerd", "worker", "browser"],
		...(process.env.NODE_ENV && {
			define: {
				// use process.env["NODE_ENV" + ""] so that esbuild doesn't replace it
				// when we do a build of wrangler. (re: https://github.com/cloudflare/workers-sdk/issues/1477)
				"process.env.NODE_ENV": `"${process.env["NODE_ENV" + ""]}"`,
				...(legacyNodeCompat ? { global: "globalThis" } : {}),
				...options.define,
			},
		}),
		loader: {
			...COMMON_ESBUILD_OPTIONS.loader,
			...(loader || {}),
		},
		plugins: [
			moduleCollector.plugin,
			...(legacyNodeCompat
				? [NodeGlobalsPolyfills({ buffer: true }), NodeModulesPolyfills()]
				: []),
			...(nodejsCompat ? [nodejsCompatPlugin] : []),
			...[cloudflareInternalPlugin],
			...(plugins || []),
			configProviderPlugin(
				Object.fromEntries(
					middlewareToLoad
						.filter((m) => m.config !== undefined)
						.map((m) => [m.name, m.config] as [string, Record<string, unknown>])
				)
			),
		],
		...(jsxFactory && { jsxFactory }),
		...(jsxFragment && { jsxFragment }),
		...(tsconfig && { tsconfig }),
		watch,
		// The default logLevel is "warning". So that we can rewrite errors before
		// logging, we disable esbuild's default logging, and log build failures
		// ourselves.
		logLevel: "silent",
	};
	let result;
	try {
		result = await esbuild.build(buildOptions);
	} catch (e) {
		if (!legacyNodeCompat && isBuildFailure(e))
			rewriteNodeCompatBuildFailure(e, forPages);
		throw e;
	}

	const entryPoint = getEntryPointFromMetafile(entry.file, result.metafile);
	const bundleType = entryPoint.exports.length > 0 ? "esm" : "commonjs";

	const sourceMapPath = Object.keys(result.metafile.outputs).filter((_path) =>
		_path.includes(".map")
	)[0];

	const resolvedEntryPointPath = path.resolve(
		entry.directory,
		entryPoint.relativePath
	);

	// A collision between additionalModules and moduleCollector.modules is incredibly unlikely because moduleCollector hashes the modules it collects.
	// However, if it happens, let's trust the explicitly provided additionalModules over the ones we discovered.
	const modules = dedupeModulesByName([
		...moduleCollector.modules,
		...additionalModules,
	]);

	// copy all referenced modules into the output bundle directory
	for (const module of modules) {
		const modulePath = path.join(
			path.dirname(resolvedEntryPointPath),
			module.name
		);
		fs.mkdirSync(path.dirname(modulePath), { recursive: true });
		fs.writeFileSync(modulePath, module.content);
	}

	return {
		modules,
		dependencies: entryPoint.dependencies,
		resolvedEntryPointPath,
		bundleType,
		stop: result.stop,
		sourceMapPath,
		sourceMapMetadata: {
			tmpDir: tmpDir.path,
			entryDirectory: entry.directory,
		},
		moduleCollector,
	};
}

/**
 * A facade that acts as a "middleware loader".
 * Instead of needing to apply a facade for each individual middleware, this allows
 * middleware to be written in a more traditional manner and then be applied all
 * at once, requiring just two esbuild steps, rather than 1 per middleware.
 */

interface MiddlewareLoader {
	name: string;
	path: string;
	active: boolean;
	// This will be provided as a virtual module at config:middleware/${name}
	config?: Record<string, unknown>;
}

async function applyMiddlewareLoaderFacade(
	entry: Entry,
	tmpDirPath: string,
	middleware: MiddlewareLoader[], // a list of paths to middleware files
	doBindings: DurableObjectBindings
): Promise<EntryWithInject> {
	// Firstly we need to insert the middleware array into the project,
	// and then we load the middleware - this insertion and loading is
	// different for each format.

	// Make sure we resolve all files relative to the actual temporary directory,
	// otherwise we'll have issues with source maps
	tmpDirPath = fs.realpathSync(tmpDirPath);

	// We need to import each of the middlewares, so we need to generate a
	// random, unique identifier that we can use for the import.
	// Middlewares are required to be default exports so we can import to any name.
	const middlewareIdentifiers = middleware.map((m, index) => [
		`__MIDDLEWARE_${index}__`,
		path.resolve(getBasePath(), m.path),
	]);

	const dynamicFacadePath = path.join(
		tmpDirPath,
		"middleware-insertion-facade.js"
	);
	const imports = middlewareIdentifiers
		.map(
			([id, middlewarePath]) =>
				/*javascript*/ `import * as ${id} from "${prepareFilePath(
					middlewarePath
				)}";`
		)
		.join("\n");

	const middlewareFns = middlewareIdentifiers.map(([m]) => `${m}.default`);

	if (entry.format === "modules") {
		const middlewareWrappers = middlewareIdentifiers
			.map(([m]) => `${m}.wrap`)
			.join(",");

		const durableObjects = doBindings
			// Don't shim anything not local to this worker
			.filter((b) => !b.script_name)
			// Reexport the DO classnames
			.map(
				(b) =>
					/*javascript*/ `export const ${b.class_name} = maskDurableObjectDefinition(OTHER_EXPORTS.${b.class_name});`
			)
			.join("\n");
		await fs.promises.writeFile(
			dynamicFacadePath,
			dedent/*javascript*/ `
				import worker, * as OTHER_EXPORTS from "${prepareFilePath(entry.file)}";
				${imports}
				const envWrappers = [${middlewareWrappers}].filter(Boolean);
				const facade = {
					...worker,
					envWrappers,
					middleware: [
						${middlewareFns.join(",")},
            ...(worker.middleware ? worker.middleware : []),
					].filter(Boolean)
				}
				export * from "${prepareFilePath(entry.file)}";

				const maskDurableObjectDefinition = (cls) =>
					class extends cls {
						constructor(state, env) {
							let wrappedEnv = env
							for (const wrapFn of envWrappers) {
								wrappedEnv = wrapFn(wrappedEnv)
							}
							super(state, wrappedEnv);
						}
					};
				${durableObjects}

				export default facade;
			`
		);

		const targetPathLoader = path.join(
			tmpDirPath,
			"middleware-loader.entry.ts"
		);
		const loaderPath = path.resolve(
			getBasePath(),
			"templates/middleware/loader-modules.ts"
		);

		const baseLoader = await fs.promises.readFile(loaderPath, "utf-8");
		const transformedLoader = baseLoader
			.replaceAll("__ENTRY_POINT__", prepareFilePath(dynamicFacadePath))
			.replace(
				"./common",
				prepareFilePath(
					path.resolve(getBasePath(), "templates/middleware/common.ts")
				)
			);

		await fs.promises.writeFile(targetPathLoader, transformedLoader);

		return {
			...entry,
			file: targetPathLoader,
		};
	} else {
		const loaderSwPath = path.resolve(
			getBasePath(),
			"templates/middleware/loader-sw.ts"
		);

		await fs.promises.writeFile(
			dynamicFacadePath,
			dedent/*javascript*/ `
				import { __facade_registerInternal__ } from "${prepareFilePath(loaderSwPath)}";
				${imports}
				__facade_registerInternal__([${middlewareFns}])
			`
		);

		return {
			...entry,
			inject: [dynamicFacadePath],
		};
	}
}

/**
 * Prefer modules towards the end of the array in the case of a collision by name.
 */
export function dedupeModulesByName(modules: CfModule[]): CfModule[] {
	return Object.values(
		modules.reduce((moduleMap, module) => {
			moduleMap[module.name] = module;
			return moduleMap;
		}, {} as Record<string, CfModule>)
	);
}
/**
 * Process the given file path to ensure it will work on all OSes.
 *
 * Windows paths contain backslashes, which are taken to be escape characters
 * when inserted directly into source code.
 * This function will escape these backslashes to make sure they work in all OSes.
 *
 */
function prepareFilePath(filePath: string): string {
	return JSON.stringify(filePath).slice(1, -1);
}
