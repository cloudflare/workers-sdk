import * as fs from "node:fs";
import * as path from "node:path";
import NodeGlobalsPolyfills from "@esbuild-plugins/node-globals-polyfill";
import NodeModulesPolyfills from "@esbuild-plugins/node-modules-polyfill";
import * as esbuild from "esbuild";
import tmp from "tmp-promise";
import { getBasePath } from "../paths";
import { applyMiddlewareLoaderFacade } from "./apply-middleware";
import {
	isBuildFailure,
	rewriteNodeCompatBuildFailure,
} from "./build-failures";
import { dedupeModulesByName } from "./dedupe-modules";
import { getEntryPointFromMetafile } from "./entry-point-from-metafile";
import { cloudflareInternalPlugin } from "./esbuild-plugins/cloudflare-internal";
import { configProviderPlugin } from "./esbuild-plugins/config-provider";
import { nodejsCompatPlugin } from "./esbuild-plugins/nodejs-compat";
import { writeAdditionalModules } from "./find-additional-modules";
import { noopModuleCollector } from "./module-collection";
import type { Config } from "../config";
import type { DurableObjectBindings } from "../config/environment";
import type { WorkerRegistry } from "../dev-registry";
import type { MiddlewareLoader } from "./apply-middleware";
import type { Entry } from "./entry";
import type { ModuleCollector } from "./module-collection";
import type { CfModule } from "./worker";

export const COMMON_ESBUILD_OPTIONS = {
	// Our workerd runtime uses the same V8 version as recent Chrome, which is highly ES2022 compliant: https://kangax.github.io/compat-table/es2016plus/
	target: "es2022",
	loader: { ".js": "jsx", ".mjs": "jsx", ".cjs": "jsx" },
} as const;

/**
 * Information about Wrangler's bundling process that needs passed through
 * for DevTools sourcemap transformation
 */
export interface SourceMapMetadata {
	tmpDir: string;
	entryDirectory: string;
}

export type BundleResult = {
	modules: CfModule[];
	dependencies: esbuild.Metafile["outputs"][string]["inputs"];
	resolvedEntryPointPath: string;
	bundleType: "esm" | "commonjs";
	stop: (() => Promise<void>) | undefined;
	sourceMapPath?: string | undefined;
	sourceMapMetadata?: SourceMapMetadata | undefined;
};

export type BundleOptions = {
	// When `bundle` is set to false, we apply shims to the Worker, but won't pull in any imports
	bundle: boolean;
	// Known additional modules provided by the outside.
	additionalModules: CfModule[];
	// A module collector enables you to observe what modules are in the Worker.
	moduleCollector: ModuleCollector;
	serveAssetsFromWorker: boolean;
	assets?: Config["assets"];
	bypassAssetCache?: boolean;
	doBindings: DurableObjectBindings;
	jsxFactory?: string;
	jsxFragment?: string;
	entryName?: string;
	watch?: boolean;
	tsconfig?: string;
	minify?: boolean;
	legacyNodeCompat?: boolean;
	nodejsCompat?: boolean;
	define: Config["define"];
	checkFetch: boolean;
	services?: Config["services"];
	workerDefinitions?: WorkerRegistry;
	targetConsumer: "dev" | "deploy";
	testScheduled?: boolean;
	inject?: string[];
	loader?: Record<string, string>;
	sourcemap?: esbuild.CommonOptions["sourcemap"];
	plugins?: esbuild.Plugin[];
	isOutfile?: boolean;
	forPages?: boolean;
	local: boolean;
};

/**
 * Generate a bundle for the worker identified by the arguments passed in.
 */
export async function bundleWorker(
	entry: Entry,
	destination: string,
	{
		bundle,
		moduleCollector = noopModuleCollector,
		additionalModules = [],
		serveAssetsFromWorker,
		doBindings,
		jsxFactory,
		jsxFragment,
		entryName,
		watch,
		tsconfig,
		minify,
		legacyNodeCompat,
		nodejsCompat,
		define,
		checkFetch,
		assets,
		bypassAssetCache,
		workerDefinitions,
		services,
		targetConsumer,
		testScheduled,
		inject: injectOption,
		loader,
		sourcemap,
		plugins,
		isOutfile,
		forPages,
		local,
	}: BundleOptions
): Promise<BundleResult> {
	// We create a temporary directory for any one-off files we
	// need to create. This is separate from the main build
	// directory (`destination`).
	const unsafeTmpDir = await tmp.dir({ unsafeCleanup: true });
	// Make sure we resolve all files relative to the actual temporary directory,
	// without symlinks, otherwise `esbuild` will generate invalid source maps.
	const tmpDirPath = fs.realpathSync(unsafeTmpDir.path);

	const entryFile = entry.file;

	// At this point, we take the opportunity to "wrap" the worker with middleware.
	const middlewareToLoad: MiddlewareLoader[] = [];

	if (targetConsumer === "dev" && !!testScheduled) {
		middlewareToLoad.push({
			name: "scheduled",
			path: "templates/middleware/middleware-scheduled.ts",
			supports: ["modules", "service-worker"],
		});
	}

	if (targetConsumer === "dev" && local) {
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
		middlewareToLoad.push({
			name: "miniflare3-json-error",
			path: "templates/middleware/middleware-miniflare3-json-error.ts",
			supports: ["modules", "service-worker"],
		});
	}

	if (serveAssetsFromWorker) {
		middlewareToLoad.push({
			name: "serve-static-assets",
			path: "templates/middleware/middleware-serve-static-assets.ts",
			config: {
				spaMode:
					typeof assets === "object" ? assets.serve_single_page_app : false,
				cacheControl:
					typeof assets === "object"
						? {
								browserTTL:
									assets.browser_TTL || 172800 /* 2 days: 2* 60 * 60 * 24 */,
								bypassCache: bypassAssetCache,
						  }
						: {},
			},
			supports: ["modules", "service-worker"],
		});
	}

	if (
		targetConsumer === "dev" &&
		!!(
			workerDefinitions &&
			Object.keys(workerDefinitions).length > 0 &&
			services &&
			services.length > 0
		)
	) {
		middlewareToLoad.push({
			name: "multiworker-dev",
			path: "templates/middleware/middleware-multiworker-dev.ts",
			config: {
				workers: Object.fromEntries(
					(services || []).map((serviceBinding) => [
						serviceBinding.binding,
						workerDefinitions?.[serviceBinding.service] || null,
					])
				),
			},
			supports: ["modules"],
		});
	}

	// If using watch, build result will not be returned.
	// This plugin will retrieve the build result on the first build.
	let initialBuildResult: (result: esbuild.BuildResult) => void;
	const initialBuildResultPromise = new Promise<esbuild.BuildResult>(
		(resolve) => (initialBuildResult = resolve)
	);
	const buildResultPlugin: esbuild.Plugin = {
		name: "Initial build result plugin",
		setup(build) {
			build.onEnd(initialBuildResult);
		},
	};

	const inject: string[] = injectOption ?? [];

	if (checkFetch) {
		// In dev, we want to patch `fetch()` with a special version that looks
		// for bad usages and can warn the user about them; so we inject
		// `checked-fetch.js` to do so. However, with yarn 3 style pnp,
		// we need to extract that file to an accessible place before injecting
		// it in, hence this code here.

		const checkedFetchFileToInject = path.join(tmpDirPath, "checked-fetch.js");

		if (checkFetch && !fs.existsSync(checkedFetchFileToInject)) {
			fs.mkdirSync(tmpDirPath, {
				recursive: true,
			});
			fs.writeFileSync(
				checkedFetchFileToInject,
				fs.readFileSync(
					path.resolve(getBasePath(), "templates/checked-fetch.js")
				)
			);
		}

		inject.push(checkedFetchFileToInject);
	}
	// Check that the current worker format is supported by all the active middleware
	for (const middleware of middlewareToLoad) {
		if (!middleware.supports.includes(entry.format)) {
			throw new Error(
				`Your Worker is written using the "${entry.format}" format, which isn't supported by the "${middleware.name}" middleware. To use "${middleware.name}" middleware, convert your Worker to the "${middleware.supports[0]}" format`
			);
		}
	}
	if (
		middlewareToLoad.length > 0 ||
		process.env.EXPERIMENTAL_MIDDLEWARE === "true"
	) {
		const result = await applyMiddlewareLoaderFacade(
			entry,
			tmpDirPath,
			middlewareToLoad,
			doBindings
		);
		entry = result.entry;

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
		inject.push(...(result.inject ?? []));
	}

	// `esbuild` doesn't support returning `watch*` options from `onStart()`
	// plugin callbacks. Instead, we define an empty virtual module that is
	// imported in this injected module. Importing that module registers watchers.
	inject.push(path.resolve(getBasePath(), "templates/modules-watch-stub.js"));

	const buildOptions: esbuild.BuildOptions & { metafile: true } = {
		// Don't use entryFile here as the file may have been changed when applying the middleware
		entryPoints: [entry.file],
		bundle,
		absWorkingDir: entry.directory,
		outdir: destination,
		entryNames: entryName || path.parse(entryFile).name,
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
				...define,
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
			cloudflareInternalPlugin,
			buildResultPlugin,
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
		// The default logLevel is "warning". So that we can rewrite errors before
		// logging, we disable esbuild's default logging, and log build failures
		// ourselves.
		logLevel: "silent",
	};

	let result: esbuild.BuildResult<typeof buildOptions>;
	let stop: BundleResult["stop"];
	try {
		if (watch) {
			const ctx = await esbuild.context(buildOptions);
			await ctx.watch();
			result = await initialBuildResultPromise;
			if (result.errors.length > 0) {
				throw new Error("Failed to build");
			}

			stop = async function () {
				await ctx.dispose();
			};
		} else {
			result = await esbuild.build(buildOptions);
		}
	} catch (e) {
		if (!legacyNodeCompat && isBuildFailure(e))
			rewriteNodeCompatBuildFailure(e.errors, forPages);
		throw e;
	}

	const entryPoint = getEntryPointFromMetafile(entryFile, result.metafile);
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

	await writeAdditionalModules(modules, path.dirname(resolvedEntryPointPath));

	return {
		modules,
		dependencies: entryPoint.dependencies,
		resolvedEntryPointPath,
		bundleType,
		stop,
		sourceMapPath,
		sourceMapMetadata: {
			tmpDir: tmpDirPath,
			entryDirectory: entry.directory,
		},
	};
}
