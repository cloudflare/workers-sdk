import crypto from "node:crypto";
import { access, cp, lstat, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { removeDir } from "@cloudflare/workers-utils";
import * as esbuild from "esbuild";
import { toUrlPath } from "./paths";
import {
	generateConfigFromFileTree,
	writeRoutesModule,
	convertRoutesToRoutesJSONSpec,
} from "./routing";
import type { UrlPath } from "./paths";
import type { Config, RouteConfig, RoutesJSONSpec } from "./routing";

/**
 * Options for compiling a Pages Functions directory into a Worker.
 */
export type BuildPagesFunctionsOptions = {
	/** Path to the functions directory containing route handler files. */
	functionsDirectory: string;

	/** Directory where the compiled Worker and its modules will be written. */
	outputDirectory: string;

	/**
	 * Directory to output static assets referenced via `assets:` imports.
	 * Defaults to `outputDirectory` if not specified.
	 */
	assetsOutputDirectory?: string;

	/**
	 * The service binding name to fall back to when no route matches.
	 * Defaults to `"ASSETS"`.
	 */
	fallbackService?: string;

	/** Whether to minify the output. Defaults to `false`. */
	minify?: boolean;

	/** Whether to generate source maps. Defaults to `false`. */
	sourcemap?: boolean;

	/** Module specifiers to exclude from the bundle. */
	external?: string[];

	/**
	 * Optional description to include in the generated `_routes.json`.
	 * If not provided, no description is included.
	 */
	routesDescription?: string;

	/** Whether to output esbuild metafile. Defaults to `false`. */
	metafile?: boolean;
};

/**
 * A collected non-JS module (WASM, text, or binary data) that should be
 * uploaded alongside the Worker entrypoint.
 */
export type CollectedModule = {
	/** The module name as referenced in the Worker bundle. */
	name: string;

	/** The module file content. */
	content: Uint8Array;

	/** The module type for the Workers upload API. */
	type: "compiled-wasm" | "text" | "buffer";
};

/**
 * The result of compiling a Pages Functions directory.
 */
export type BuildPagesFunctionsResult = {
	/** Absolute path to the compiled Worker entrypoint. */
	entryPointPath: string;

	/** The bundle format — always `"esm"` for Pages Functions. */
	bundleType: "esm";

	/** Non-JS modules (WASM, text, binary) collected during bundling. */
	modules: CollectedModule[];

	/** esbuild dependency graph for the bundle. */
	dependencies: esbuild.Metafile["outputs"][string]["inputs"];

	/** Path to the source map file, if source maps were enabled. */
	sourceMapPath?: string;

	/** The generated `_routes.json` routing spec. */
	routesJSON: RoutesJSONSpec;

	/** The filepath routing configuration (routes + baseURL). */
	filepathRoutingConfig: {
		routes: RouteConfig[];
		baseURL: UrlPath;
	};

	/** The esbuild metafile, if `metafile` was enabled. */
	metafile?: esbuild.Metafile;
};

/**
 * Compile a Pages Functions directory into a Cloudflare Worker bundle.
 *
 * This function:
 * 1. Scans the functions directory for route handler exports
 * 2. Generates a routes module mapping URL patterns to handlers
 * 3. Bundles the Pages Worker runtime template with the routes
 * 4. Collects non-JS modules (WASM, text, binary)
 * 5. Writes the output to the specified directory
 *
 * @param options - Build configuration
 * @returns The build result including entrypoint path, modules, and routing metadata
 * @throws When no routes are found in the functions directory
 * @throws When the functions directory does not exist
 */
export async function buildPagesFunctions(
	options: BuildPagesFunctionsOptions
): Promise<BuildPagesFunctionsResult> {
	const {
		functionsDirectory,
		outputDirectory,
		assetsOutputDirectory,
		fallbackService = "ASSETS",
		minify = false,
		sourcemap = false,
		external,
		routesDescription,
		metafile = false,
	} = options;

	const absoluteFunctionsDirectory = resolve(functionsDirectory);
	const absoluteOutputDirectory = resolve(outputDirectory);
	const baseURL = toUrlPath("/");

	const { config, routesJSON } = await discoverRoutes(
		functionsDirectory,
		absoluteFunctionsDirectory,
		baseURL,
		routesDescription
	);

	const { routesModulePath, tmpDir } = await writeTemporaryRoutesModule(
		config,
		absoluteFunctionsDirectory
	);

	try {
		// Resolve the template path.
		// The template is a raw .ts file that esbuild compiles at runtime.
		// It is shipped in src/templates/ relative to the package root.
		// When running from source (src/build.ts): import.meta.dirname is src/ -> ../src/templates/
		// When running from dist (dist/index.mjs): import.meta.dirname is dist/ -> ../src/templates/
		const templatePath = resolve(
			import.meta.dirname,
			"..",
			"src",
			"templates",
			"pages-template-worker.ts"
		);

		const collectedModules: CollectedModule[] = [];
		const outfile = join(absoluteOutputDirectory, "index.js");

		const result = await esbuild.build({
			entryPoints: [templatePath],
			outfile,
			bundle: true,
			format: "esm",
			target: "es2024",
			supported: { "import-source": true },
			loader: { ".js": "jsx", ".mjs": "jsx", ".cjs": "jsx" },
			conditions: ["workerd", "worker", "browser"],
			inject: [routesModulePath],
			define: {
				__FALLBACK_SERVICE__: JSON.stringify(fallbackService),
			},
			minify,
			keepNames: true,
			sourcemap,
			metafile: true,
			external,
			plugins: [
				createModuleCollectorPlugin(collectedModules),
				createAssetsPlugin(assetsOutputDirectory, absoluteOutputDirectory),
			],
		});

		await Promise.all(
			collectedModules.map(async (module) => {
				const modulePath = join(absoluteOutputDirectory, module.name);
				await mkdir(dirname(modulePath), { recursive: true });
				await writeFile(modulePath, module.content);
			})
		);

		const { dependencies, sourceMapPath } = await extractBuildMetadata(
			result,
			outfile,
			sourcemap
		);

		return {
			entryPointPath: outfile,
			bundleType: "esm",
			modules: collectedModules,
			dependencies,
			sourceMapPath,
			routesJSON,
			filepathRoutingConfig: {
				routes: config.routes ?? [],
				baseURL,
			},
			metafile: metafile ? result.metafile : undefined,
		};
	} finally {
		await removeDir(tmpDir);
	}
}

/**
 * Error thrown when no routes are found in the functions directory.
 */
export class PagesFunctionsNoRoutesError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "PagesFunctionsNoRoutesError";
	}
}

/**
 * Scan the functions directory for route handler exports and generate the
 * `_routes.json` spec from them.
 *
 * @param functionsDirectory - The raw (user-provided) functions directory path, used in error messages.
 * @param absoluteFunctionsDirectory - The resolved absolute path to scan.
 * @param baseURL - The base URL prefix for all routes.
 * @param routesDescription - Optional description to embed in `_routes.json`.
 * @returns The parsed route config and the generated `_routes.json` spec.
 * @throws {PagesFunctionsNoRoutesError} When the directory contains no route handlers.
 */
async function discoverRoutes(
	functionsDirectory: string,
	absoluteFunctionsDirectory: string,
	baseURL: UrlPath,
	routesDescription: string | undefined
): Promise<{ config: Config; routesJSON: RoutesJSONSpec }> {
	const config: Config = await generateConfigFromFileTree({
		baseDir: absoluteFunctionsDirectory,
		baseURL,
	});

	if (!config.routes || config.routes.length === 0) {
		throw new PagesFunctionsNoRoutesError(
			`Failed to find any routes while compiling Functions in: ${functionsDirectory}`
		);
	}

	const routesJSON = convertRoutesToRoutesJSONSpec(
		config.routes,
		routesDescription
	);

	return { config, routesJSON };
}

/**
 * Write a temporary ES module that re-exports every route handler discovered
 * by {@link discoverRoutes}.  The module is injected into the esbuild bundle
 * so that the Pages template worker can import the route table at runtime.
 *
 * @param config - The route configuration returned by {@link discoverRoutes}.
 * @param absoluteFunctionsDirectory - Absolute path to the functions source directory.
 * @returns An object containing the absolute path to the generated routes module
 *   and the temporary directory that should be cleaned up after the build.
 */
async function writeTemporaryRoutesModule(
	config: Config,
	absoluteFunctionsDirectory: string
): Promise<{ routesModulePath: string; tmpDir: string }> {
	const tmpDir = await mkdtemp(join(tmpdir(), "pages-functions-"));
	const routesModulePath = join(tmpDir, "functionsRoutes.mjs");

	await writeRoutesModule({
		config,
		srcDir: absoluteFunctionsDirectory,
		outfile: routesModulePath,
	});

	return { routesModulePath, tmpDir };
}

/**
 * Read a file, hash its contents, record it in `collectedModules`, and return
 * an external esbuild resolution using the hashed module name.
 *
 * This is the shared implementation behind the WASM, text, and binary module
 * loaders inside the module-collector plugin.
 *
 * @param filePath - Absolute path to the module file on disk.
 * @param moduleType - The Workers upload type (`compiled-wasm`, `text`, or `buffer`).
 * @param collectedModules - Mutable array to push the collected module into.
 * @returns An esbuild `OnResolveResult` that preserves an import of the hashed module name.
 */
async function collectModule(
	filePath: string,
	moduleType: CollectedModule["type"],
	collectedModules: CollectedModule[]
): Promise<esbuild.OnResolveResult> {
	const { readFile } = await import("node:fs/promises");
	const content = await readFile(filePath);
	const hash = crypto
		.createHash("sha1")
		.update(content)
		.digest("hex")
		.slice(0, 8);
	const moduleName = `./${hash}-${basename(filePath)}`;
	if (!collectedModules.some((module) => module.name === moduleName)) {
		collectedModules.push({
			name: moduleName,
			content: new Uint8Array(content),
			type: moduleType,
		});
	}
	return {
		path: moduleName,
		external: true,
	};
}

const moduleCollectorResolution = {};

/**
 * Create an esbuild plugin that intercepts `.wasm`, text (`.txt`, `.html`,
 * `.sql`), and binary (`.bin`) imports, hashes their contents, and records
 * them as {@link CollectedModule} entries for later upload.
 *
 * @param collectedModules - Mutable array that the plugin appends to during the build.
 * @returns An esbuild plugin.
 */
function createModuleCollectorPlugin(
	collectedModules: CollectedModule[]
): esbuild.Plugin {
	return {
		name: "pages-functions-module-collector",
		setup(build) {
			for (const [filter, moduleType] of [
				[/\.wasm(\?module)?$/, "compiled-wasm"],
				[/\.(txt|html|sql)$/, "text"],
				[/\.bin$/, "buffer"],
			] as const) {
				build.onResolve({ filter }, async (args) => {
					if (args.pluginData === moduleCollectorResolution) {
						return;
					}

					const modulePath = args.path.replace(/\?module$/, "");
					const resolved = await build.resolve(modulePath, {
						importer: args.importer,
						kind: args.kind,
						namespace: args.namespace,
						pluginData: moduleCollectorResolution,
						resolveDir: args.resolveDir,
						with: args.with,
					});

					if (resolved.errors.length > 0 || resolved.external) {
						return resolved;
					}

					return collectModule(resolved.path, moduleType, collectedModules);
				});
			}
		},
	};
}

/**
 * Create an esbuild plugin that handles `assets:` import specifiers.
 *
 * When a route handler writes `import "assets:./static"`, this plugin copies
 * the referenced directory into a deterministic path under the output
 * directory and replaces the import with an `onRequest` handler that proxies
 * to the asset-serving binding.
 *
 * @param assetsOutputDirectory - Optional override for the directory where static assets are written.
 * @param absoluteOutputDirectory - The default output directory (used when `assetsOutputDirectory` is not set).
 * @returns An esbuild plugin.
 */
function createAssetsPlugin(
	assetsOutputDirectory: string | undefined,
	absoluteOutputDirectory: string
): esbuild.Plugin {
	return {
		name: "pages-functions-assets",
		setup(pluginBuild) {
			const identifiers = new Map<string, string>();

			pluginBuild.onResolve({ filter: /^assets:/ }, async (args) => {
				const directory = resolve(
					args.resolveDir,
					args.path.slice("assets:".length)
				);

				const exists = await access(directory)
					.then(() => true)
					.catch(() => false);

				const isDirectory = exists && (await lstat(directory)).isDirectory();

				if (!isDirectory) {
					return {
						errors: [
							{
								text: `'${directory}' does not exist or is not a directory.`,
							},
						],
					};
				}

				identifiers.set(directory, crypto.randomUUID());
				return { path: directory, namespace: "assets" };
			});

			pluginBuild.onLoad(
				{ filter: /.*/, namespace: "assets" },
				async (args) => {
					const identifier = identifiers.get(args.path);
					const targetDir = assetsOutputDirectory || absoluteOutputDirectory;

					const staticAssetsOutputDirectory = join(
						targetDir,
						"cdn-cgi",
						"pages-plugins",
						identifier as string
					);
					await cp(args.path, staticAssetsOutputDirectory, {
						force: true,
						recursive: true,
					});

					return {
						contents: `export const onRequest = ({ request, env, functionPath }) => {
							const url = new URL(request.url);
							const relativePathname = \`/\${url.pathname.replace(functionPath, "") || ""}\`.replace(/^\\/\\//, '/');
							url.pathname = '/cdn-cgi/pages-plugins/${identifier}' + relativePathname;
							request = new Request(url.toString(), request);
							return env.ASSETS.fetch(request);
						}`,
					};
				}
			);
		},
	};
}

/**
 * Extract dependency metadata and source-map path from an esbuild build
 * result.
 *
 * @param result - The esbuild build result (must have `metafile` enabled).
 * @param outfile - The absolute path to the compiled Worker entrypoint.
 * @param sourcemap - Whether source maps were requested.
 * @returns The dependency inputs map and the optional source-map file path.
 */
async function extractBuildMetadata(
	result: esbuild.BuildResult<{ metafile: true }>,
	outfile: string,
	sourcemap: boolean
): Promise<{
	dependencies: esbuild.Metafile["outputs"][string]["inputs"];
	sourceMapPath: string | undefined;
}> {
	const metaOutputs = result.metafile?.outputs ?? {};
	const entryOutput = Object.values(metaOutputs).find(
		(output) => output.entryPoint !== undefined
	);
	const dependencies = entryOutput?.inputs ?? {};

	let sourceMapPath: string | undefined;
	if (sourcemap) {
		const mapFile = `${outfile}.map`;
		try {
			await access(mapFile);
			sourceMapPath = mapFile;
		} catch {
			// source map may be inline
		}
	}

	return { dependencies, sourceMapPath };
}
