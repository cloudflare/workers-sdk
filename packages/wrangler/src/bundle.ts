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
import type { Entry } from "./entry";
import type { CfModule } from "./worker";

type BundleResult = {
	modules: CfModule[];
	resolvedEntryPointPath: string;
	bundleType: "esm" | "commonjs";
	stop: (() => void) | undefined;
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
	const middleware: (false | MiddlewareFn)[] = [
		serveAssetsFromWorker &&
			((currentEntry: Entry) => {
				return applyStaticAssetFacade(currentEntry, tmpDir.path, assets);
			}),
		// We use an env var here because we don't actually
		// want to expose this to the user. It's only used internally to
		// experiment with middleware as a teaching exercise.
		process.env.FORMAT_WRANGLER_ERRORS === "true" &&
			((currentEntry: Entry) => {
				return applyFormatDevErrorsFacade(currentEntry, tmpDir.path);
			}),
	].filter((x) => x !== false);

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

	return {
		modules: moduleCollector.modules,
		resolvedEntryPointPath: path.resolve(
			entry.directory,
			entryPointOutputs[0][0]
		),
		bundleType,
		stop: result.stop,
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
 * Generate a string that describes the entry-points that were identified by esbuild.
 */
function listEntryPoints(
	outputs: [string, ValueOf<esbuild.Metafile["outputs"]>][]
): string {
	return outputs.map(([_input, output]) => output.entryPoint).join("\n");
}

type ValueOf<T> = T[keyof T];
