import * as fs from "node:fs";
import * as path from "node:path";
import NodeGlobalsPolyfills from "@esbuild-plugins/node-globals-polyfill";
import NodeModulesPolyfills from "@esbuild-plugins/node-modules-polyfill";
import * as esbuild from "esbuild";
import {
	getBuildConditionsFromEnv,
	getBuildPlatformFromEnv,
} from "../environment-variables/misc-variables";
import { UserError } from "../errors";
import { getBasePath, getWranglerTmpDir } from "../paths";
import { applyMiddlewareLoaderFacade } from "./apply-middleware";
import {
	isBuildFailure,
	rewriteNodeCompatBuildFailure,
} from "./build-failures";
import { dedupeModulesByName } from "./dedupe-modules";
import { getEntryPointFromMetafile } from "./entry-point-from-metafile";
import { asyncLocalStoragePlugin } from "./esbuild-plugins/als-external";
import { cloudflareInternalPlugin } from "./esbuild-plugins/cloudflare-internal";
import { configProviderPlugin } from "./esbuild-plugins/config-provider";
import { nodejsHybridPlugin } from "./esbuild-plugins/hybrid-nodejs-compat";
import { nodejsCompatPlugin } from "./esbuild-plugins/nodejs-compat";
import { standardURLPlugin } from "./esbuild-plugins/standard-url";
import { writeAdditionalModules } from "./find-additional-modules";
import { noopModuleCollector } from "./module-collection";
import type { Config } from "../config";
import type {
	DurableObjectBindings,
	WorkflowBinding,
} from "../config/environment";
import type { MiddlewareLoader } from "./apply-middleware";
import type { Entry } from "./entry";
import type { ModuleCollector } from "./module-collection";
import type { CfModule, CfModuleType } from "./worker";
import type { NodeJSCompatMode } from "miniflare";

// Taken from https://stackoverflow.com/a/3561711
// which is everything from the tc39 proposal, plus the following two characters: ^/
// It's also everything included in the URLPattern escape (https://wicg.github.io/urlpattern/#escape-a-regexp-string), plus the following: -
// As the answer says, there's no downside to escaping these extra characters, so better safe than sorry
const ESCAPE_REGEX_CHARACTERS = /[-/\\^$*+?.()|[\]{}]/g;
const escapeRegex = (str: string) => {
	return str.replace(ESCAPE_REGEX_CHARACTERS, "\\$&");
};

export const COMMON_ESBUILD_OPTIONS = {
	// Our workerd runtime uses the same V8 version as recent Chrome, which is highly ES2022 compliant: https://kangax.github.io/compat-table/es2016plus/
	target: "es2022",
	loader: { ".js": "jsx", ".mjs": "jsx", ".cjs": "jsx" },
} as const;

/**
 * Get the custom build conditions used by esbuild, and when resolving custom `import` calls.
 *
 * If we do not override these in an env var, we will set them to "workerd", "worker" and "browser".
 * If we override in env vars then these will be provided to esbuild instead.
 *
 * Whether or not we set custom conditions the `default` condition will always be active.
 * If the Worker is using ESM syntax, then the `import` condition will also be active.
 *
 * Moreover the following applies:
 * - if the platform is set to `browser` (the default) then the `browser` condition will be active.
 * - if the platform is set to `node` then the `node` condition will be active.
 *
 * See https://esbuild.github.io/api/#how-conditions-work for more info.
 */
export function getBuildConditions() {
	const envVar = getBuildConditionsFromEnv();
	if (envVar !== undefined) {
		return envVar.split(",");
	} else {
		return ["workerd", "worker", "browser"];
	}
}

function getBuildPlatform(): esbuild.Platform {
	const platform = getBuildPlatformFromEnv();
	if (
		platform !== undefined &&
		!["browser", "node", "neutral"].includes(platform)
	) {
		throw new UserError(
			"Invalid esbuild platform configuration defined in the WRANGLER_BUILD_PLATFORM environment variable.\n" +
				"Valid platform values are: 'browser', 'node' and 'neutral'."
		);
	}
	return platform as esbuild.Platform;
}

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
	bundleType: CfModuleType;
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
	serveLegacyAssetsFromWorker: boolean;
	legacyAssets: Config["legacy_assets"] | undefined;
	bypassAssetCache: boolean | undefined;
	doBindings: DurableObjectBindings;
	workflowBindings: WorkflowBinding[];
	jsxFactory: string | undefined;
	jsxFragment: string | undefined;
	entryName: string | undefined;
	watch: boolean | undefined;
	tsconfig: string | undefined;
	minify: boolean | undefined;
	nodejsCompatMode: NodeJSCompatMode | undefined;
	define: Config["define"];
	alias: Config["alias"];
	checkFetch: boolean;
	mockAnalyticsEngineDatasets: Config["analytics_engine_datasets"];
	targetConsumer: "dev" | "deploy";
	testScheduled: boolean | undefined;
	inject: string[] | undefined;
	sourcemap: esbuild.CommonOptions["sourcemap"] | undefined;
	plugins: esbuild.Plugin[] | undefined;
	isOutfile: boolean | undefined;
	local: boolean;
	projectRoot: string | undefined;
	defineNavigatorUserAgent: boolean;
	external: string[] | undefined;
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
		serveLegacyAssetsFromWorker,
		doBindings,
		workflowBindings,
		jsxFactory,
		jsxFragment,
		entryName,
		watch,
		tsconfig,
		minify,
		nodejsCompatMode,
		alias,
		define,
		checkFetch,
		mockAnalyticsEngineDatasets,
		legacyAssets,
		bypassAssetCache,
		targetConsumer,
		testScheduled,
		inject: injectOption,
		sourcemap,
		plugins,
		isOutfile,
		local,
		projectRoot,
		defineNavigatorUserAgent,
		external,
	}: BundleOptions
): Promise<BundleResult> {
	// We create a temporary directory for any one-off files we
	// need to create. This is separate from the main build
	// directory (`destination`).
	const tmpDir = getWranglerTmpDir(projectRoot, "bundle");

	const entryFile = entry.file;

	// At this point, we take the opportunity to "wrap" the worker with middleware.
	const middlewareToLoad: MiddlewareLoader[] = [];

	if (
		targetConsumer === "dev" &&
		mockAnalyticsEngineDatasets &&
		mockAnalyticsEngineDatasets.length > 0
	) {
		middlewareToLoad.push({
			name: "mock-analytics-engine",
			path: "templates/middleware/middleware-mock-analytics-engine.ts",
			config: {
				bindings: mockAnalyticsEngineDatasets.map(({ binding }) => binding),
			},
			supports: ["modules", "service-worker"],
		});
	}

	if (
		targetConsumer === "dev" &&
		!process.env.WRANGLER_DISABLE_REQUEST_BODY_DRAINING
	) {
		middlewareToLoad.push({
			name: "ensure-req-body-drained",
			path: "templates/middleware/middleware-ensure-req-body-drained.ts",
			supports: ["modules", "service-worker"],
		});
	}

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

	if (serveLegacyAssetsFromWorker) {
		middlewareToLoad.push({
			name: "serve-static-assets",
			path: "templates/middleware/middleware-serve-static-assets.ts",
			config: {
				spaMode:
					typeof legacyAssets === "object"
						? legacyAssets.serve_single_page_app
						: false,
				cacheControl:
					typeof legacyAssets === "object"
						? {
								browserTTL:
									legacyAssets.browser_TTL ||
									172800 /* 2 days: 2* 60 * 60 * 24 */,
								bypassCache: bypassAssetCache,
							}
						: {},
			},
			supports: ["modules", "service-worker"],
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

		const checkedFetchFileToInject = path.join(tmpDir.path, "checked-fetch.js");

		if (checkFetch && !fs.existsSync(checkedFetchFileToInject)) {
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
			throw new UserError(
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
			tmpDir.path,
			middlewareToLoad
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

	if (watch) {
		// `esbuild` doesn't support returning `watch*` options from `onStart()`
		// plugin callbacks. Instead, we define an empty virtual module that is
		// imported in this injected module. Importing that module registers watchers.
		inject.push(path.resolve(getBasePath(), "templates/modules-watch-stub.js"));
	}

	// esbuild's `alias` option is applied after each plugin's onResolve hook,
	// whereas we would like these user-defined aliases to take precedence over
	// the unenv polyfill aliases, so we reimplement the aliasing as a plugin
	// to be applied before that plugin (earlier in the array of plugins)
	const aliasPlugin: esbuild.Plugin = {
		name: "alias",
		setup(build) {
			if (!alias) {
				return;
			}

			// filter the hook calls to only those that match the alias keys
			// this should avoid slowing down builds which don't use aliasing
			const filter = new RegExp(
				Object.keys(alias)
					.map((key) => escapeRegex(key))
					.join("|")
			);

			// reimplement module aliasing as an esbuild plugin onResolve hook
			build.onResolve({ filter }, (args) => {
				const aliasPath = alias[args.path];
				if (aliasPath) {
					return {
						// resolve with node resolution
						path: require.resolve(aliasPath, {
							// From the esbuild alias docs: "Note that when an import path is substituted using an alias, the resulting import path is resolved in the working directory instead of in the directory containing the source file with the import path."
							// https://esbuild.github.io/api/#alias:~:text=Note%20that%20when%20an%20import%20path%20is%20substituted%20using%20an%20alias%2C%20the%20resulting%20import%20path%20is%20resolved%20in%20the%20working%20directory%20instead%20of%20in%20the%20directory%20containing%20the%20source%20file%20with%20the%20import%20path.
							paths: [entry.projectRoot],
						}),
					};
				}
			});
		},
	};

	const buildOptions: esbuild.BuildOptions & { metafile: true } = {
		// Don't use entryFile here as the file may have been changed when applying the middleware
		entryPoints: [entry.file],
		bundle,
		absWorkingDir: entry.projectRoot,
		outdir: destination,
		keepNames: true,
		entryNames: entryName || path.parse(entryFile).name,
		...(isOutfile
			? {
					outdir: undefined,
					outfile: destination,
					entryNames: undefined,
				}
			: {}),
		inject,
		external: bundle
			? ["__STATIC_CONTENT_MANIFEST", ...(external ? external : [])]
			: undefined,
		format: entry.format === "modules" ? "esm" : "iife",
		target: COMMON_ESBUILD_OPTIONS.target,
		sourcemap: sourcemap ?? true,
		// Include a reference to the output folder in the sourcemap.
		// This is omitted by default, but we need it to properly resolve source paths in error output.
		sourceRoot: destination,
		minify,
		metafile: true,
		conditions: getBuildConditions(),
		platform: getBuildPlatform(),
		...(process.env.NODE_ENV && {
			define: {
				...(defineNavigatorUserAgent
					? { "navigator.userAgent": `"Cloudflare-Workers"` }
					: {}),
				// use process.env["NODE_ENV" + ""] so that esbuild doesn't replace it
				// when we do a build of wrangler. (re: https://github.com/cloudflare/workers-sdk/issues/1477)
				"process.env.NODE_ENV": `"${process.env["NODE_ENV" + ""]}"`,
				...(nodejsCompatMode === "legacy" ? { global: "globalThis" } : {}),
				...define,
			},
		}),
		loader: COMMON_ESBUILD_OPTIONS.loader,
		plugins: [
			aliasPlugin,
			moduleCollector.plugin,
			...(nodejsCompatMode === "als" ? [asyncLocalStoragePlugin] : []),
			...(nodejsCompatMode === "legacy"
				? [
						NodeGlobalsPolyfills({ buffer: true }),
						standardURLPlugin(),
						NodeModulesPolyfills(),
					]
				: []),
			// Runtime Node.js compatibility (will warn if not using nodejs compat flag and are trying to import from a Node.js builtin).
			...(nodejsCompatMode === "v1" || nodejsCompatMode !== "v2"
				? [nodejsCompatPlugin(nodejsCompatMode === "v1")]
				: []),
			// Hybrid Node.js compatibility
			...(nodejsCompatMode === "v2" ? [nodejsHybridPlugin()] : []),
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
				throw new BuildFailure(
					"Initial build failed.",
					result.errors,
					result.warnings
				);
			}

			stop = async function () {
				tmpDir.remove();
				await ctx.dispose();
			};
		} else {
			result = await esbuild.build(buildOptions);
			// Even when we're not watching, we still want some way of cleaning up the
			// temporary directory when we don't need it anymore
			stop = async function () {
				tmpDir.remove();
			};
		}
	} catch (e) {
		if (isBuildFailure(e)) {
			rewriteNodeCompatBuildFailure(e.errors, nodejsCompatMode);
		}
		throw e;
	}

	const entryPoint = getEntryPointFromMetafile(entryFile, result.metafile);
	const notExportedDOs = doBindings
		.filter((x) => !x.script_name && !entryPoint.exports.includes(x.class_name))
		.map((x) => x.class_name);
	if (notExportedDOs.length) {
		const relativePath = path.relative(process.cwd(), entryFile);
		throw new UserError(
			`Your Worker depends on the following Durable Objects, which are not exported in your entrypoint file: ${notExportedDOs.join(
				", "
			)}.\nYou should export these objects from your entrypoint, ${relativePath}.`
		);
	}

	const notExportedWorkflows = workflowBindings
		.filter((x) => !x.script_name && !entryPoint.exports.includes(x.class_name))
		.map((x) => x.class_name);
	if (notExportedWorkflows.length) {
		const relativePath = path.relative(process.cwd(), entryFile);
		throw new UserError(
			`Your Worker depends on the following Workflows, which are not exported in your entrypoint file: ${notExportedWorkflows.join(
				", "
			)}.\nYou should export these objects from your entrypoint, ${relativePath}.`
		);
	}

	const bundleType = entryPoint.exports.length > 0 ? "esm" : "commonjs";

	const sourceMapPath = Object.keys(result.metafile.outputs).filter((_path) =>
		_path.includes(".map")
	)[0];

	const resolvedEntryPointPath = path.resolve(
		entry.projectRoot,
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
			tmpDir: tmpDir.path,
			entryDirectory: entry.projectRoot,
		},
	};
}

class BuildFailure extends Error {
	constructor(
		message: string,
		readonly errors: esbuild.Message[],
		readonly warnings: esbuild.Message[]
	) {
		super(message);
	}
}

/**
 * Whether to add middleware to check whether fetch requests use custom ports.
 *
 * This is controlled in the runtime by compatibility_flags:
 *  - `ignore_custom_ports` - check fetch
 *  - `allow_custom_ports` - do not check fetch
 *
 * `allow_custom_ports` became the default on 2024-09-02.
 */
export function shouldCheckFetch(
	compatibilityDate: string = "2000-01-01", // Default to some arbitrary old date
	compatibilityFlags: string[] = []
): boolean {
	// Yes, the logic can be less verbose than this but doing it this way makes it very clear.
	if (compatibilityFlags.includes("ignore_custom_ports")) {
		return true;
	}
	if (compatibilityFlags.includes("allow_custom_ports")) {
		return false;
	}
	return compatibilityDate < "2024-09-02";
}
