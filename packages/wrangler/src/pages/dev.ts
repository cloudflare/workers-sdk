import { execSync, spawn } from "node:child_process";
import events from "node:events";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import path, { dirname, join, normalize, resolve } from "node:path";
import { watch } from "chokidar";
import * as esbuild from "esbuild";
import { configFileName, readConfig } from "../config";
import { createCommand } from "../core/create-command";
import { isBuildFailure } from "../deployment-bundle/build-failures";
import { shouldCheckFetch } from "../deployment-bundle/bundle";
import { esbuildAliasExternalPlugin } from "../deployment-bundle/esbuild-plugins/alias-external";
import { validateNodeCompatMode } from "../deployment-bundle/node-compat";
import { startDev } from "../dev";
import { FatalError, UserError } from "../errors";
import { run } from "../experimental-flags";
import { logger } from "../logger";
import * as metrics from "../metrics";
import { isNavigatorDefined } from "../navigator-user-agent";
import { getBasePath } from "../paths";
import { formatCompatibilityDate } from "../utils/compatibility-date";
import { debounce } from "../utils/debounce";
import * as shellquote from "../utils/shell-quote";
import { buildFunctions } from "./buildFunctions";
import { ROUTES_SPEC_VERSION, SECONDS_TO_WAIT_FOR_PROXY } from "./constants";
import { FunctionsNoRoutesError, getFunctionsNoRoutesWarning } from "./errors";
import {
	buildRawWorker,
	checkRawWorker,
	produceWorkerBundleForWorkerJSDirectory,
} from "./functions/buildWorker";
import { validateRoutes } from "./functions/routes-validation";
import { CLEANUP, CLEANUP_CALLBACKS, getPagesTmpDir } from "./utils";
import type { Config } from "../config";
import type {
	DurableObjectBindings,
	EnvironmentNonInheritable,
} from "../config/environment";
import type { CfModule } from "../deployment-bundle/worker";
import type { AdditionalDevProps } from "../dev";
import type { RoutesJSONSpec } from "./functions/routes-transformation";

/*
 * DURABLE_OBJECTS_BINDING_REGEXP matches strings like:
 * - "binding=className"
 * - "BINDING=MyClass"
 * - "BINDING=MyClass@service-name"
 * Every DO needs a binding (the JS reference) and the exported class name it refers to.
 * Optionally, users can also provide a service name if they want to reference a DO from another dev session over the dev registry.
 */
const DURABLE_OBJECTS_BINDING_REGEXP = new RegExp(
	/^(?<binding>[^=]+)=(?<className>[^@\s]+)(@(?<scriptName>.*)$)?$/
);

/* BINDING_REGEXP matches strings like:
 * - "binding"
 * - "BINDING"
 * - "BINDING=ref"
 * This is used to capture both the binding name (how the binding is used in JS) as well as the reference if provided.
 * In the case of a D1 database, that's the database ID.
 * This is useful to people who want to reference the same database in multiple bindings, or a Worker and Pages project dev session want to reference the same database.
 */
const BINDING_REGEXP = new RegExp(/^(?<binding>[^=]+)(?:=(?<ref>[^\s]+))?$/);

/* SERVICE_BINDING_REGEXP matches strings like:
 * - "binding=service"
 * - "binding=service@environment"
 * - "binding=service#entrypoint"
 * This is used to capture both the binding name (how the binding is used in JS) alongside the name of the service it needs to bind to.
 * Additionally it can also accept an environment which indicates what environment the service has to be running for.
 * Additionally it can also accept an entrypoint which indicates what named entrypoint of the service to use, if not the default.
 */
const SERVICE_BINDING_REGEXP = new RegExp(
	/^(?<binding>[^=]+)=(?<service>[^@#\s]+)(@(?<environment>.*)$)?(#(?<entrypoint>.*))?$/
);

const DEFAULT_IP = process.platform === "win32" ? "127.0.0.1" : "localhost";
const DEFAULT_PAGES_LOCAL_PORT = 8788;
const DEFAULT_SCRIPT_PATH = "_worker.js";

export const pagesDevCommand = createCommand({
	metadata: {
		description: "Develop your full-stack Pages application locally",
		status: "stable",
		owner: "Workers: Authoring and Testing",
		hideGlobalFlags: ["config", "env"],
	},
	behaviour: {
		provideConfig: false,
	},
	args: {
		directory: {
			type: "string",
			description: "The directory of static assets to serve",
		},
		command: {
			type: "string",
			description: "The proxy command to run  [deprecated]",
		},
		local: {
			type: "boolean",
			default: true,
			description: "Run on my machine",
			deprecated: true,
			hidden: true,
		},
		"compatibility-date": {
			description: "Date to use for compatibility checks",
			type: "string",
		},
		"compatibility-flags": {
			description: "Flags to use for compatibility checks",
			alias: "compatibility-flag",
			type: "string",
			array: true,
		},
		ip: {
			type: "string",
			// On Windows, when specifying `localhost` as the socket hostname,
			// `workerd` will only listen on the IPv4 loopback `127.0.0.1`, not the
			// IPv6 `::1`: https://github.com/cloudflare/workerd/issues/1408
			// On Node 17+, `fetch()` will only try to fetch the IPv6 address.
			// For now, on Windows, we default to listening on IPv4 only and using
			// `127.0.0.1` when sending control requests to `workerd` (e.g. with the
			// `ProxyController`).
			description: "The IP address to listen on",
		},
		port: {
			type: "number",
			description: "The port to listen on (serve from)",
		},
		"inspector-port": {
			type: "number",
			description: "Port for devtools to connect to",
		},
		proxy: {
			type: "number",
			description: "The port to proxy (where the static assets are served)",
			deprecated: true,
		},
		"script-path": {
			type: "string",
			description:
				"The location of the single Worker script if not using functions  [default: _worker.js]",
			// hacking in a fake default message here so we can detect when user is setting this and show a deprecation message
			deprecated: true,
		},
		bundle: {
			type: "boolean",
			default: undefined,
			hidden: true,
		},
		"no-bundle": {
			type: "boolean",
			default: undefined,
			conflicts: "bundle",
			description: "Whether to run bundling on `_worker.js`",
		},
		binding: {
			type: "array",
			description: "Bind variable/secret (KEY=VALUE)",
			alias: "b",
		},
		kv: {
			type: "array",
			description: "KV namespace to bind (--kv KV_BINDING)",
			alias: "k",
		},
		d1: {
			type: "array",
			description: "D1 database to bind (--d1 D1_BINDING)",
		},
		do: {
			type: "array",
			description:
				"Durable Object to bind (--do DO_BINDING=CLASS_NAME@SCRIPT_NAME)",
			alias: "o",
		},
		r2: {
			type: "array",
			description: "R2 bucket to bind (--r2 R2_BINDING)",
		},
		ai: {
			type: "string",
			description: "AI to bind (--ai AI_BINDING)",
		},
		"version-metadata": {
			type: "string",
			description:
				"Worker Version metadata (--version-metadata VERSION_METADATA_BINDING)",
		},
		service: {
			type: "array",
			description: "Service to bind (--service SERVICE=SCRIPT_NAME)",
			alia: "s",
		},
		"live-reload": {
			type: "boolean",
			default: false,
			description: "Auto reload HTML pages when change is detected",
		},
		"local-protocol": {
			description: "Protocol to listen to requests on, defaults to http.",
			choices: ["http", "https"] as const,
		},
		"https-key-path": {
			description: "Path to a custom certificate key",
			type: "string",
			requiresArg: true,
		},
		"https-cert-path": {
			description: "Path to a custom certificate",
			type: "string",
			requiresArg: true,
		},
		"persist-to": {
			description:
				"Specify directory to use for local persistence (defaults to .wrangler/state)",
			type: "string",
			requiresArg: true,
		},
		"node-compat": {
			description: "Enable Node.js compatibility",
			default: false,
			type: "boolean",
			hidden: true,
			deprecated: true,
		},
		"experimental-local": {
			description: "Run on my machine using the Cloudflare Workers runtime",
			type: "boolean",
			deprecated: true,
			hidden: true,
		},
		"log-level": {
			choices: ["debug", "info", "log", "warn", "error", "none"] as const,
			description: "Specify logging level",
		},
		"show-interactive-dev-session": {
			description:
				"Show interactive dev session (defaults to true if the terminal supports interactivity)",
			type: "boolean",
		},
		"experimental-vectorize-bind-to-prod": {
			type: "boolean",
			description:
				"Bind to production Vectorize indexes in local development mode",
			default: false,
		},
		"experimental-images-local-mode": {
			type: "boolean",
			description:
				"Use a local lower-fidelity implementation of the Images binding",
			default: false,
		},
	},
	positionalArgs: ["directory", "command"],
	async handler(args) {
		if (args.logLevel) {
			logger.loggerLevel = args.logLevel;
		}

		if (args.nodeCompat) {
			throw new UserError(
				`The --node-compat flag is no longer supported as of Wrangler v4. Instead, use the \`nodejs_compat\` compatibility flag. This includes the functionality from legacy \`node_compat\` polyfills and natively implemented Node.js APIs. See https://developers.cloudflare.com/workers/runtime-apis/nodejs for more information.`
			);
		}

		if (args.experimentalLocal) {
			logger.warn(
				"--experimental-local is no longer required and will be removed in a future version.\n`wrangler pages dev` now uses the local Cloudflare Workers runtime by default."
			);
		}

		if (args.config && !Array.isArray(args.config)) {
			throw new FatalError(
				"Pages does not support custom paths for the Wrangler configuration file",
				1
			);
		}

		if (args.env) {
			throw new FatalError(
				"Pages does not support targeting an environment with the --env flag during local development.",
				1
			);
		}

		if (args.scriptPath !== undefined) {
			logger.warn(
				`\`--script-path\` is deprecated and will be removed in a future version of Wrangler.\nThe Worker script should be named \`_worker.js\` and located in the build output directory of your project (specified with \`wrangler pages dev <directory>\`).`
			);
		}

		// for `dev` we always use the top-level config, which means we need
		// to read the config file with `env` set to `undefined`
		const config = readConfig(
			{ ...args, env: undefined, config: undefined },
			{ useRedirectIfAvailable: true }
		);

		if (
			args.config &&
			Array.isArray(args.config) &&
			config.configPath &&
			path.resolve(process.cwd(), args.config[0]) !== config.configPath
		) {
			throw new FatalError(
				"The first `--config` argument must point to your Pages configuration file: " +
					path.relative(process.cwd(), config.configPath)
			);
		}
		const resolvedDirectory = args.directory ?? config.pages_build_output_dir;
		const [_pages, _dev, ...remaining] = args._;
		const command = remaining;
		let proxyPort: number | undefined;
		let directory = resolvedDirectory;

		if (directory !== undefined && command.length > 0) {
			throw new FatalError(
				"Specify either a directory OR a proxy command, not both.",
				1
			);
		} else if (directory === undefined) {
			proxyPort = await spawnProxyProcess({
				port: args.proxy,
				command,
			});
			if (proxyPort === undefined) {
				return undefined;
			}
		} else {
			directory = resolve(directory);
		}

		const {
			compatibilityDate,
			compatibilityFlags,
			ip,
			port,
			inspectorPort,
			localProtocol,
		} = resolvePagesDevServerSettings(config, args);

		const {
			vars,
			kv_namespaces,
			do_bindings,
			d1_databases,
			r2_buckets,
			services,
			ai,
		} = getBindingsFromArgs(args);

		let scriptReadyResolve: () => void;
		const scriptReadyPromise = new Promise<void>(
			(promiseResolve) => (scriptReadyResolve = promiseResolve)
		);

		const singleWorkerScriptPath = args.scriptPath ?? DEFAULT_SCRIPT_PATH;
		const workerScriptPath =
			directory !== undefined
				? join(directory, singleWorkerScriptPath)
				: resolve(singleWorkerScriptPath);
		const usingWorkerDirectory =
			existsSync(workerScriptPath) && lstatSync(workerScriptPath).isDirectory();
		const usingWorkerScript = existsSync(workerScriptPath);
		const enableBundling = args.bundle ?? !(args.noBundle ?? config.no_bundle);

		const functionsDirectory = "./functions";
		let usingFunctions = !usingWorkerScript && existsSync(functionsDirectory);

		let scriptPath = "";

		const nodejsCompatMode = validateNodeCompatMode(
			args.compatibilityDate ?? config.compatibility_date,
			args.compatibilityFlags ?? config.compatibility_flags ?? [],
			{
				noBundle: !enableBundling,
			}
		);

		const defineNavigatorUserAgent = isNavigatorDefined(
			compatibilityDate,
			compatibilityFlags
		);

		const checkFetch = shouldCheckFetch(compatibilityDate, compatibilityFlags);

		let modules: CfModule[] = [];

		if (usingWorkerDirectory) {
			const runBuild = async () => {
				const bundleResult = await produceWorkerBundleForWorkerJSDirectory({
					workerJSDirectory: workerScriptPath,
					bundle: enableBundling,
					buildOutputDirectory: directory ?? ".",
					nodejsCompatMode,
					defineNavigatorUserAgent,
					checkFetch,
					sourceMaps: config?.upload_source_maps ?? false,
				});
				modules = bundleResult.modules;
				scriptPath = bundleResult.resolvedEntryPointPath;
			};

			await runBuild().then(() => scriptReadyResolve());

			watch([workerScriptPath], {
				persistent: true,
				ignoreInitial: true,
			}).on("all", async () => {
				try {
					await runBuild();
				} catch (e) {
					if (isBuildFailure(e)) {
						logger.warn("Error building worker script:", e.message);
						return;
					}
					throw e;
				}
			});
		} else if (usingWorkerScript) {
			/*
			 * Delegate watching for file changes to chokidar entirely. This gives
			 * us a bit more flexibility and control as opposed to esbuild watch
			 * mode, and keeps things consistent with the Functions implementation
			 */
			// always watch _worker.js
			const watcher = watch([workerScriptPath], {
				persistent: true,
				ignoreInitial: true,
			});
			let watchedBundleDependencies: string[] = [];

			scriptPath = workerScriptPath;

			let runBuild = async () => {
				await checkRawWorker(workerScriptPath, nodejsCompatMode, () =>
					scriptReadyResolve()
				);
			};

			if (enableBundling) {
				// We want to actually run the `_worker.js` script through the bundler
				// So update the final path to the script that will be uploaded and
				// change the `runBuild()` function to bundle the `_worker.js`.
				scriptPath = join(
					getPagesTmpDir(),
					`./bundledWorker-${Math.random()}.mjs`
				);

				runBuild = async () => {
					const workerScriptDirectory = dirname(workerScriptPath);
					let currentBundleDependencies: string[] = [];

					const bundle = await buildRawWorker({
						workerScriptPath: usingWorkerDirectory
							? join(workerScriptPath, "index.js")
							: workerScriptPath,
						outfile: scriptPath,
						directory: directory ?? ".",
						nodejsCompatMode,
						local: true,
						sourcemap: true,
						watch: false,
						onEnd: () => scriptReadyResolve(),
						defineNavigatorUserAgent,
						checkFetch,
					});

					/*
					 * EXCLUDE:
					 *   - "_worker.js" because we're already watching it
					 *   - everything in "./.wrangler", as it's mostly cache and
					 *     temporary files
					 *   - anything outside of the current working directory, since we
					 *     are expecting `wrangler pages dev` to be run from the Pages
					 *     project root folder
					 */
					const bundleDependencies = Object.keys(bundle.dependencies)
						.map((dep) => resolve(workerScriptDirectory, dep))
						.filter(
							(resolvedDep) =>
								!resolvedDep.includes(normalize(singleWorkerScriptPath)) &&
								!resolvedDep.includes(normalize("/.wrangler/")) &&
								resolvedDep.includes(resolve(process.cwd()))
						);

					// handle non-JS module dependencies, such as wasm/html/binary imports
					const bundleModules = bundle.modules
						.filter((module) => !!module.filePath)
						.map((module) =>
							resolve(workerScriptDirectory, module.filePath as string)
						);

					/*
					 *`bundle.dependencies` and `bundle.modules` combined, will always
					 * provide us with the most up-to-date list of dependencies we need
					 * to watch, since they reflect the latest built Worker bundle.
					 * Therefore, we can safely unwatch all dependencies we have been
					 * watching so far, and add all the new ones.
					 */
					currentBundleDependencies = [...bundleDependencies, ...bundleModules];

					if (watchedBundleDependencies.length) {
						watcher.unwatch(watchedBundleDependencies);
					}
					watcher.add(currentBundleDependencies);
					watchedBundleDependencies = [...currentBundleDependencies];
				};
			}

			/*
			 * Improve developer experience by debouncing the re-building
			 * of the Worker script, in case file changes are trigerred
			 * at a high rate (for example if code editor runs auto-saves
			 * at very short intervals)
			 *
			 * "Debouncing ensures that exactly one signal is sent for an
			 * event that may be happening several times — or even several
			 * hundreds of times over an extended period. As long as the
			 * events are occurring fast enough to happen at least once in
			 * every detection period, the signal will not be sent!"
			 * (http://unscriptable.com/2009/03/20/debouncing-javascript-methods/)
			 */
			const debouncedRunBuild = debounce(async () => {
				try {
					await runBuild();
				} catch {
					/*
					 * don't break developer flow in watch mode by throwing an error
					 * here. Many times errors will be just the result of unfinished
					 * typing. Instead, log the error, point out we are still serving
					 * the last successfully built Worker, and allow developers to
					 * write their code to completion
					 */
					logger.warn(
						`Failed to build ${singleWorkerScriptPath}. Continuing to serve the last successfully built version of the Worker.`
					);
				}
			}, 50);

			try {
				await runBuild();

				watcher.on("all", async (eventName, p) => {
					logger.debug(`🌀 "${eventName}" event detected at ${p}.`);

					// Skip re-building the Worker if "_worker.js" was deleted.
					// This is necessary for Pages projects + Frameworks, where
					// the file was potentially deleted as part of a build process,
					// which will add the updated file back.
					// see https://github.com/cloudflare/workers-sdk/issues/3886
					if (eventName === "unlink") {
						return;
					}

					debouncedRunBuild();
				});
			} catch {
				/*
				 * fail early if we encounter errors while attempting to build the
				 * Worker. These flag underlying issues in the _worker.js code, and
				 * should be addressed before starting the dev process
				 */
				throw new FatalError(`Failed to build ${singleWorkerScriptPath}.`);
			}
		} else if (usingFunctions) {
			// Try to use Functions
			scriptPath = join(
				getPagesTmpDir(),
				`./functionsWorker-${Math.random()}.mjs`
			);
			const routesModule = join(
				getPagesTmpDir(),
				`./functionsRoutes-${Math.random()}.mjs`
			);

			logger.debug(`Compiling worker to "${scriptPath}"...`);

			const onEnd = () => scriptReadyResolve();

			/*
			 * Pages Functions projects cannot rely on esbuild's watch mode alone.
			 * That's because the watch mode that's built into esbuild is designed
			 * specifically for only triggering a rebuild when esbuild's build inputs
			 * are changed (see https://github.com/evanw/esbuild/issues/3705). With
			 * Functions, we would actually want to trigger a rebuild every time a new
			 * file is added to the "/functions" directory.
			 *
			 * One solution would be to use an esbuild plugin, and "teach" esbuild to
			 * watch the "/functions" directory. But it's more complicated than that.
			 * When we build Functions, one of the steps is to generate the routes
			 * based on the file tree (see `generateConfigFileFromTree`). These routes
			 * are then injected into the esbuild entrypoint (see
			 * `templates/pages-template-worker.ts`). Delegating the "/functions" dir
			 * watching to an esbuild plugin, would mean delegating the routes generation
			 * to that plugin as well. This gets very hairy very quickly.
			 *
			 * Another solution, is to use a combination of dependencies watching, via
			 * esbuild, and file system watching, via chokidar. The downside of this
			 * approach is that a lot of syncing between the two watch modes must be put
			 * in place, in order to avoid triggering building Functions multiple times
			 * over one single change (like for example renaming file that's part of the
			 * dependency graph)
			 *
			 * Another solution, which is the one we opted for here, is to delegate file
			 * watching entirely to a file system watcher, chokidar in this case. While
			 * not entirely downside-free
			 *   - we still rely on esbuild to provide us with the dependency graph
			 *   - we need some logic in place to pre-process and filter the dependencies
			 *     we pass to chokidar
			 *   - we need to keep track of which dependencies are being watched
			 * this solution keeps all things watch mode in one place, makes things easier
			 * to read, reason about and maintain, separates Pages <-> esbuild concerns
			 * better, and gives all the flexibility we needed.
			 */
			// always watch the "/functions" directory
			const watcher = watch([functionsDirectory], {
				persistent: true,
				ignoreInitial: true,
			});
			let watchedBundleDependencies: string[] = [];

			const buildFn = async () => {
				let currentBundleDependencies: string[] = [];

				const bundle = await buildFunctions({
					outfile: scriptPath,
					functionsDirectory,
					sourcemap: true,
					watch: false,
					onEnd,
					buildOutputDirectory: directory,
					nodejsCompatMode,
					local: true,
					routesModule,
					defineNavigatorUserAgent,
					checkFetch,
				});

				/*
				 * EXCLUDE:
				 *   - the "/functions" directory because we're already watching it
				 *   - everything in "./.wrangler", as it's mostly cache and
				 *     temporary files
				 *   - any bundle dependencies we are already watching
				 *   - anything outside of the current working directory, since we
				 *     are expecting `wrangler pages dev` to be run from the Pages
				 *     project root folder
				 */
				const bundleDependencies = Object.keys(bundle.dependencies)
					.map((dep) => resolve(functionsDirectory, dep))
					.filter(
						(resolvedDep) =>
							!resolvedDep.includes(normalize("/functions/")) &&
							!resolvedDep.includes(normalize("/.wrangler/")) &&
							resolvedDep.includes(resolve(process.cwd()))
					);

				// handle non-JS module dependencies, such as wasm/html/binary imports
				const bundleModules = bundle.modules
					.filter((module) => !!module.filePath)
					.map((module) =>
						resolve(functionsDirectory, module.filePath as string)
					);

				/*
				 *`bundle.dependencies` and `bundle.modules` will always contain the
				 * latest dependency list of the current bundle. If we are currently
				 * watching any dependency files not in that list, we should remove
				 * them, as they are no longer relevant to the compiled Functions.
				 */
				currentBundleDependencies = [...bundleDependencies, ...bundleModules];

				if (watchedBundleDependencies.length) {
					watcher.unwatch(watchedBundleDependencies);
				}
				watcher.add(currentBundleDependencies);
				watchedBundleDependencies = [...currentBundleDependencies];

				metrics.sendMetricsEvent("build pages functions");
			};

			/*
			 * Improve developer experience by debouncing the re-building
			 * of Functions.
			 *
			 * "Debouncing ensures that exactly one signal is sent for an
			 * event that may be happening several times — or even several
			 * hundreds of times over an extended period. As long as the
			 * events are occurring fast enough to happen at least once in
			 * every detection period, the signal will not be sent!"
			 * (http://unscriptable.com/2009/03/20/debouncing-javascript-methods/)
			 *
			 * This handles use cases such as bulk file/directory changes
			 * (such as copy/pasting multiple files/directories), where
			 * chokidar will trigger a change event per each changed file/
			 * directory. In such use cases, we want to ensure that we
			 * re-build Functions once, as opposed to once per change event.
			 */
			const debouncedBuildFn = debounce(async () => {
				try {
					await buildFn();
				} catch (e) {
					if (e instanceof FunctionsNoRoutesError) {
						logger.warn(
							`${getFunctionsNoRoutesWarning(functionsDirectory)}. Continuing to serve the last successfully built version of Functions.`
						);
					} else {
						/*
						 * don't break developer flow in watch mode by throwing an error
						 * here. Many times errors will be just the result of unfinished
						 * typing. Instead, log the error, point out we are still serving
						 * the last successfully built Functions, and allow developers to
						 * write their code to completion
						 */
						logger.warn(
							`Failed to build Functions at ${functionsDirectory}. Continuing to serve the last successfully built version of Functions.`
						);
					}
				}
			}, 50);

			try {
				await buildFn();

				// If Functions found routes, continue using Functions
				watcher.on("all", async (eventName, p) => {
					logger.debug(`🌀 "${eventName}" event detected at ${p}.`);

					debouncedBuildFn();
				});
			} catch (e: unknown) {
				// If there are no Functions, then Pages will only serve assets.
				if (e instanceof FunctionsNoRoutesError) {
					logger.error(
						getFunctionsNoRoutesWarning(functionsDirectory, "skipping")
					);
					// Resolve anyway and run without Functions
					onEnd();
					usingFunctions = false;
				} else {
					/*
					 * do not start the `pages dev` session if we encounter errors
					 * while attempting to build Functions. These flag underlying
					 * issues in the Functions code, and should be addressed before
					 */
					throw new FatalError(
						`Failed to build Functions at ${functionsDirectory}.`
					);
				}
			}
		}

		// Depending on the result of building Functions, we may not actually be using
		// Functions even if the directory exists.
		if (!usingFunctions && !usingWorkerScript) {
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			scriptReadyResolve!();

			logger.log("No Functions. Shimming...");
			scriptPath = resolve(getBasePath(), "templates/pages-shim.ts");
		}

		await scriptReadyPromise;

		if (scriptPath === "") {
			// Failed to get a script with or without Functions,
			// something really bad must have happened.
			throw new Error(
				"Failed to start wrangler pages dev due to an unknown error"
			);
		}

		let scriptEntrypoint = scriptPath;

		// custom _routes.json apply only to Functions or Advanced Mode Pages projects
		if (
			directory &&
			(usingFunctions || usingWorkerScript || usingWorkerDirectory)
		) {
			const routesJSONPath = join(directory, "_routes.json");

			if (existsSync(routesJSONPath)) {
				let routesJSONContents: string;
				const runBuild = async (
					entrypointFile: string,
					outfile: string,
					routes: string
				) => {
					await esbuild.build({
						entryPoints: [
							resolve(getBasePath(), "templates/pages-dev-pipeline.ts"),
						],
						bundle: true,
						sourcemap: true,
						format: "esm",
						plugins: [
							esbuildAliasExternalPlugin({
								__ENTRY_POINT__: entrypointFile,
								"./pages-dev-util": resolve(
									getBasePath(),
									"templates/pages-dev-util.ts"
								),
							}),
						],
						outfile,
						define: {
							__ROUTES__: routes,
						},
					});
				};

				try {
					// always run the routes validation first. If _routes.json is invalid we
					// want to throw accordingly and exit.
					routesJSONContents = readFileSync(routesJSONPath, "utf-8");
					validateRoutes(JSON.parse(routesJSONContents), directory);

					scriptEntrypoint = join(
						getPagesTmpDir(),
						`${Math.random().toString(36).slice(2)}.js`
					);
					await runBuild(scriptPath, scriptEntrypoint, routesJSONContents);
				} catch (err) {
					if (err instanceof FatalError) {
						throw err;
					} else {
						throw new FatalError(
							`Could not validate _routes.json at ${directory}: ${err}`,
							1
						);
					}
				}

				watch([routesJSONPath], {
					persistent: true,
					ignoreInitial: true,
				}).on("all", async (event) => {
					try {
						if (event === "unlink") {
							return;
						}
						/**
						 * Watch for _routes.json file changes and validate file each time.
						 * If file is valid proceed to running the build.
						 */
						routesJSONContents = readFileSync(routesJSONPath, "utf-8");
						validateRoutes(JSON.parse(routesJSONContents), directory as string);
						await runBuild(scriptPath, scriptEntrypoint, routesJSONContents);
					} catch (err) {
						/**
						 * If _routes.json is invalid, don't exit but instead fallback to a sensible default
						 * and continue to serve the assets. At the same time make sure we warn users that we
						 * we detected an invalid file and that we'll be using a default.
						 * This basically equates to serving a Functions or _worker.js project as is,
						 * without applying any additional routing rules on top.
						 */
						const error =
							err instanceof FatalError
								? err
								: `Could not validate _routes.json at ${directory}: ${err}`;
						const defaultRoutesJSONSpec: RoutesJSONSpec = {
							version: ROUTES_SPEC_VERSION,
							include: ["/*"],
							exclude: [],
						};

						logger.error(error);
						logger.warn(
							`Ignoring provided _routes.json file, and falling back to the following default routes configuration:\n` +
								`${JSON.stringify(defaultRoutesJSONSpec, null, 2)}`
						);

						routesJSONContents = JSON.stringify(defaultRoutesJSONSpec);
						await runBuild(scriptPath, scriptEntrypoint, routesJSONContents);
					}
				});
			}
		}

		const devServer = await run(
			{
				MULTIWORKER: Array.isArray(args.config),
				RESOURCES_PROVISION: false,
				REMOTE_BINDINGS: false,
				DEPLOY_REMOTE_DIFF_CHECK: false,
			},
			() =>
				startDev({
					script: scriptEntrypoint,
					_: [],
					$0: "",
					remote: false,
					local: true,
					d1Databases: d1_databases,
					testScheduled: false,
					enablePagesAssetsServiceBinding: {
						proxyPort,
						directory,
					},
					forceLocal: true,
					liveReload: args.liveReload,
					showInteractiveDevSession: args.showInteractiveDevSession,
					processEntrypoint: true,
					additionalModules: modules,
					v: undefined,
					cwd: undefined,
					assets: undefined,
					name: undefined,
					noBundle: false,
					latest: false,
					routes: undefined,
					host: undefined,
					localUpstream: undefined,
					upstreamProtocol: undefined,
					var: undefined,
					define: undefined,
					alias: undefined,
					jsxFactory: undefined,
					jsxFragment: undefined,
					tsconfig: undefined,
					minify: undefined,
					legacyEnv: undefined,
					env: undefined,
					envFile: undefined,
					ip,
					port,
					inspectorPort,
					localProtocol,
					httpsKeyPath: args.httpsKeyPath,
					httpsCertPath: args.httpsCertPath,
					compatibilityDate,
					compatibilityFlags,
					nodeCompat: undefined,
					vars,
					kv: kv_namespaces,
					durableObjects: do_bindings,
					r2: r2_buckets,
					services,
					ai,
					rules: usingWorkerDirectory
						? [
								{
									type: "ESModule",
									globs: ["**/*.js", "**/*.mjs"],
								},
							]
						: undefined,
					bundle: enableBundling,
					persistTo: args.persistTo,
					logLevel: args.logLevel ?? "log",
					experimentalProvision: undefined,
					experimentalRemoteBindings: false,
					experimentalVectorizeBindToProd: false,
					experimentalImagesLocalMode: false,
					enableIpc: true,
					config: Array.isArray(args.config) ? args.config : undefined,
					site: undefined,
					siteInclude: undefined,
					siteExclude: undefined,
					enableContainers: false,
				})
		);

		metrics.sendMetricsEvent("run pages dev");

		process.on("exit", CLEANUP);
		process.on("SIGINT", CLEANUP);
		process.on("SIGTERM", CLEANUP);

		await events.once(devServer.devEnv, "teardown");
		const teardownRegistry = await devServer.teardownRegistryPromise;
		await teardownRegistry?.(devServer.devEnv.config.latestConfig?.name);

		devServer.unregisterHotKeys?.();
		CLEANUP();
		process.exit(0);
	},
});

function isWindows() {
	return process.platform === "win32";
}

async function sleep(ms: number) {
	await new Promise((promiseResolve) => setTimeout(promiseResolve, ms));
}

function getPids(pid: number) {
	const pids: number[] = [pid];
	let command: string, regExp: RegExp;

	if (isWindows()) {
		command = `wmic process where (ParentProcessId=${pid}) get ProcessId`;
		regExp = new RegExp(/(\d+)/);
	} else {
		command = `pgrep -P ${pid}`;
		regExp = new RegExp(/(\d+)/);
	}

	try {
		const newPids = (
			execSync(command)
				.toString()
				.split("\n")
				.map((line) => line.match(regExp))
				.filter((line) => line !== null) as RegExpExecArray[]
		).map((match) => parseInt(match[1]));

		pids.push(...newPids.map(getPids).flat());
	} catch {}

	return pids;
}

function getPort(pid: number) {
	let command: string, regExp: RegExp;

	if (isWindows()) {
		command = process.env.SYSTEMROOT + "\\system32\\netstat.exe -nao";
		regExp = new RegExp(`TCP\\s+.*:(\\d+)\\s+.*:\\d+\\s+LISTENING\\s+${pid}`);
	} else {
		command = "lsof -nPi";
		regExp = new RegExp(`${pid}\\s+.*TCP\\s+.*:(\\d+)\\s+\\(LISTEN\\)`);
	}

	try {
		const matches = execSync(command)
			.toString()
			.split("\n")
			.map((line) => line.match(regExp))
			.filter((line) => line !== null) as RegExpExecArray[];

		const match = matches[0];
		if (match) {
			return parseInt(match[1]);
		}
	} catch (thrown) {
		logger.error(
			`Error scanning for ports of process with PID ${pid}: ${thrown}`
		);
	}
}

async function spawnProxyProcess({
	port,
	command,
}: {
	port?: number;
	command: (string | number)[];
}): Promise<undefined | number> {
	if (command.length > 0 || port !== undefined) {
		logger.warn(
			`Specifying a \`-- <command>\` or \`--proxy\` is deprecated and will be removed in a future version of Wrangler.\nBuild your application to a directory and run the \`wrangler pages dev <directory>\` instead.\nThis results in a more faithful emulation of production behavior.`
		);
	}
	if (port !== undefined) {
		logger.warn(
			"On Node.js 17+, wrangler will default to fetching only the IPv6 address. Please ensure that the process listening on the port specified via `--proxy` is configured for IPv6."
		);
	}
	if (command.length === 0) {
		if (port !== undefined) {
			return port;
		}

		CLEANUP();
		throw new FatalError(
			`Must specify a directory of static assets to serve, or a command to run, or a proxy port, or configure \`pages_build_output_dir\` in your Wrangler configuration file.`,
			1
		);
	}

	logger.log(`Running ${shellquote.quote(command)}...`);
	const proxy = spawn(
		command[0].toString(),
		command.slice(1).map((value) => value.toString()),
		{
			shell: isWindows(),
			env: {
				BROWSER: "none",
				...process.env,
			},
		}
	);
	CLEANUP_CALLBACKS.push(() => {
		proxy.kill();
	});

	proxy.stdout.on("data", (data) => {
		logger.log(`[proxy]: ${data}`);
	});

	proxy.stderr.on("data", (data) => {
		logger.error(`[proxy]: ${data}`);
	});

	proxy.on("close", (code) => {
		logger.error(`Proxy exited with status ${code}.`);
		CLEANUP();
		process.exitCode = code ?? 0;
	});

	// Wait for proxy process to start...
	while (!proxy.pid) {}

	if (port === undefined) {
		logger.log(
			`Sleeping ${SECONDS_TO_WAIT_FOR_PROXY} seconds to allow proxy process to start before attempting to automatically determine port...`
		);
		logger.log("To skip, specify the proxy port with --proxy.");
		await sleep(SECONDS_TO_WAIT_FOR_PROXY * 1000);

		port = getPids(proxy.pid)
			.map(getPort)
			.filter((nr) => nr !== undefined)[0];

		if (port === undefined) {
			CLEANUP();
			throw new FatalError(
				"Could not automatically determine proxy port. Please specify the proxy port with --proxy.",
				1
			);
		} else {
			logger.log(`Automatically determined the proxy port to be ${port}.`);
		}
	}

	return port;
}

/**
 * Reconciles top-level & local development settings, with `pages dev`command line args taking
 * precedence over `wrangler.toml` configuration. This function does not handle the bindings
 * reconciliation.
 */
function resolvePagesDevServerSettings(
	config: Config,
	args: typeof pagesDevCommand.args
) {
	// resolve compatibility date
	let compatibilityDate = args.compatibilityDate || config.compatibility_date;
	if (!compatibilityDate) {
		const currentDate = formatCompatibilityDate(new Date());
		logger.warn(
			`No compatibility_date was specified. Using today's date: ${currentDate}.\n` +
				`❯❯ Add one to your ${configFileName(config.configPath)} file: compatibility_date = "${currentDate}", or\n` +
				`❯❯ Pass it in your terminal: wrangler pages dev [<DIRECTORY>] --compatibility-date=${currentDate}\n\n` +
				"See https://developers.cloudflare.com/workers/platform/compatibility-dates/ for more information."
		);
		compatibilityDate = currentDate;
	}

	return {
		compatibilityDate,
		compatibilityFlags: args.compatibilityFlags ?? config.compatibility_flags,
		ip: args.ip ?? config.dev.ip ?? DEFAULT_IP,
		// because otherwise `unstable_dev` will default the port number to `0`
		port: args.port ?? config.dev?.port ?? DEFAULT_PAGES_LOCAL_PORT,
		inspectorPort: args.inspectorPort ?? config.dev?.inspector_port,
		localProtocol: args.localProtocol ?? config.dev?.local_protocol,
	};
}

/**
 * Parses the arguments specified by `pages dev` for environment bindings, and converts them
 * into arrays of appropriate environment binding structures
 */
function getBindingsFromArgs(args: typeof pagesDevCommand.args): Partial<
	Pick<
		EnvironmentNonInheritable,
		| "vars"
		| "kv_namespaces"
		| "r2_buckets"
		| "d1_databases"
		| "services"
		| "ai"
		| "version_metadata"
	>
> & {
	do_bindings?: DurableObjectBindings;
} {
	// get environment variables from the [--vars] arg
	let vars: EnvironmentNonInheritable["vars"] = {};
	if (args.binding?.length) {
		vars = Object.fromEntries(
			args.binding
				.map((binding) => binding.toString().split("="))
				.map(([key, ...values]) => [key, values.join("=")])
		);
	}

	// get KV bindings from the [--kv] arg
	let kvNamespaces: EnvironmentNonInheritable["kv_namespaces"] | undefined;
	if (args.kv?.length) {
		kvNamespaces = args.kv
			.map((kv) => {
				const { binding, ref } =
					BINDING_REGEXP.exec(kv.toString())?.groups || {};

				if (!binding) {
					logger.warn("Could not parse KV binding:", kv.toString());
					return;
				}

				return {
					binding,
					id: ref || kv.toString(),
				};
			})
			.filter(Boolean) as EnvironmentNonInheritable["kv_namespaces"];
	}

	// get DO bindings from the [--do] arg
	let durableObjectsBindings: DurableObjectBindings | undefined;
	if (args.do?.length) {
		durableObjectsBindings = args.do
			.map((durableObject) => {
				const { binding, className, scriptName } =
					DURABLE_OBJECTS_BINDING_REGEXP.exec(durableObject.toString())
						?.groups || {};

				if (!binding || !className) {
					logger.warn(
						"Could not parse Durable Object binding:",
						durableObject.toString()
					);
					return;
				}

				return {
					name: binding,
					class_name: className,
					script_name: scriptName,
				};
			})
			.filter(Boolean) as AdditionalDevProps["durableObjects"];
	}

	// get D1 bindings from the [--d1] arg
	let d1Databases: EnvironmentNonInheritable["d1_databases"] | undefined;
	if (args.d1?.length) {
		d1Databases = args.d1
			.map((d1) => {
				const { binding, ref } =
					BINDING_REGEXP.exec(d1.toString())?.groups || {};

				if (!binding) {
					logger.warn("Could not parse D1 binding:", d1.toString());
					return;
				}

				return {
					binding,
					database_id: ref || d1.toString(),
					database_name: `local-${d1}`,
				};
			})
			.filter(Boolean) as EnvironmentNonInheritable["d1_databases"];
	}

	// get R2 bindings from the [--r2] arg
	let r2Buckets: EnvironmentNonInheritable["r2_buckets"] | undefined;
	if (args.r2?.length) {
		r2Buckets = args.r2
			.map((r2) => {
				const { binding, ref } =
					BINDING_REGEXP.exec(r2.toString())?.groups || {};

				if (!binding) {
					logger.warn("Could not parse R2 binding:", r2.toString());
					return;
				}

				// The generated `bucket_name` might be invalid as per https://developers.cloudflare.com/r2/buckets/create-buckets/#bucket-level-operations
				// However this name only applies to the dev environment and is not validated by miniflare.
				return { binding, bucket_name: ref || binding.toString() };
			})
			.filter(Boolean) as EnvironmentNonInheritable["r2_buckets"];
	}

	// get service bindings from the [--services] arg
	let services: EnvironmentNonInheritable["services"] | undefined;
	if (args.service?.length) {
		services = args.service
			.map((serviceBinding) => {
				const { binding, service, environment, entrypoint } =
					SERVICE_BINDING_REGEXP.exec(serviceBinding.toString())?.groups || {};

				if (!binding || !service) {
					logger.warn(
						"Could not parse Service binding:",
						serviceBinding.toString()
					);
					return;
				}

				// Envs get appended to the end of the name
				let serviceName = service;
				if (environment) {
					serviceName = `${service}-${environment}`;
				}

				return {
					binding,
					service: serviceName,
					environment,
					entrypoint,
				};
			})
			.filter(Boolean) as NonNullable<AdditionalDevProps["services"]>;

		if (services.find(({ environment }) => !!environment)) {
			// We haven't yet properly defined how environments of service bindings should
			// work, so if the user is using an environment for any of their service
			// bindings we warn them that they are experimental
			logger.warn("Support for service binding environments is experimental.");
		}
	}

	// get ai bindings from the [--ai] arg
	let ai: EnvironmentNonInheritable["ai"] | undefined;
	if (args.ai) {
		ai = { binding: args.ai.toString() };
	}

	// get version_metadata binding from the [--version_metadata] arg
	let version_metadata:
		| EnvironmentNonInheritable["version_metadata"]
		| undefined;
	if (args.versionMetadata) {
		version_metadata = { binding: args.versionMetadata.toString() };
	}

	/*
	 * all these bindings will be merged with their corresponding configuration file counterparts
	 * in `startDev()` -> `getBindingsAndAssetPaths()` -> `getBindings()`, so no need to address
	 * that here
	 */
	return {
		vars: vars,
		kv_namespaces: kvNamespaces,
		d1_databases: d1Databases,
		r2_buckets: r2Buckets,
		services,
		ai,
		version_metadata,

		// don't construct the full `EnvironmentNonInheritable["durable_objects"]` shape here.
		// `startDev()` will do that for us in its `getBindings()` function
		do_bindings: durableObjectsBindings,
	};
}
