import { execSync, spawn } from "node:child_process";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { watch } from "chokidar";
import * as esbuild from "esbuild";
import { unstable_dev } from "../api";
import { readConfig } from "../config";
import { isBuildFailure } from "../deployment-bundle/build-failures";
import { esbuildAliasExternalPlugin } from "../deployment-bundle/esbuild-plugins/alias-external";
import { validateNodeCompat } from "../deployment-bundle/node-compat";
import { FatalError } from "../errors";
import { logger } from "../logger";
import * as metrics from "../metrics";
import { isNavigatorDefined } from "../navigator-user-agent";
import { getBasePath } from "../paths";
import { printWranglerBanner } from "../update-check";
import * as shellquote from "../utils/shell-quote";
import { buildFunctions } from "./buildFunctions";
import { ROUTES_SPEC_VERSION, SECONDS_TO_WAIT_FOR_PROXY } from "./constants";
import {
	FunctionsBuildError,
	FunctionsNoRoutesError,
	getFunctionsBuildWarning,
	getFunctionsNoRoutesWarning,
} from "./errors";
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
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";
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

export function Options(yargs: CommonYargsArgv) {
	return yargs
		.positional("directory", {
			type: "string",
			demandOption: undefined,
			description: "The directory of static assets to serve",
		})
		.positional("command", {
			type: "string",
			demandOption: undefined,
			description: "The proxy command to run  [deprecated]", // no official way to deprecate a positional argument
		})
		.options({
			local: {
				type: "boolean",
				default: true,
				description: "Run on my machine",
				deprecated: true,
				hidden: true,
			},
			"compatibility-date": {
				describe: "Date to use for compatibility checks",
				type: "string",
			},
			"compatibility-flags": {
				describe: "Flags to use for compatibility checks",
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
				describe: "Port for devtools to connect to",
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
				default: false,
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
				describe: "Protocol to listen to requests on, defaults to http.",
				choices: ["http", "https"] as const,
			},
			"https-key-path": {
				describe: "Path to a custom certificate key",
				type: "string",
				requiresArg: true,
			},
			"https-cert-path": {
				describe: "Path to a custom certificate",
				type: "string",
				requiresArg: true,
			},
			"persist-to": {
				describe:
					"Specify directory to use for local persistence (defaults to .wrangler/state)",
				type: "string",
				requiresArg: true,
			},
			"node-compat": {
				describe: "Enable Node.js compatibility",
				default: false,
				type: "boolean",
				hidden: true,
			},
			"experimental-local": {
				describe: "Run on my machine using the Cloudflare Workers runtime",
				type: "boolean",
				deprecated: true,
				hidden: true,
			},
			config: {
				describe:
					"Pages does not support custom paths for the wrangler.toml configuration file",
				type: "string",
				hidden: true,
			},
			"log-level": {
				choices: ["debug", "info", "log", "warn", "error", "none"] as const,
				describe: "Specify logging level",
			},
			"show-interactive-dev-session": {
				describe:
					"Show interactive dev session (defaults to true if the terminal supports interactivity)",
				type: "boolean",
			},
			"experimental-registry": {
				alias: ["x-registry"],
				type: "boolean",
				describe:
					"Use the experimental file based dev registry for multi-worker development",
				default: false,
			},
		});
}

type PagesDevArguments = StrictYargsOptionsToInterface<typeof Options>;

export const Handler = async (args: PagesDevArguments) => {
	if (args.logLevel) {
		logger.loggerLevel = args.logLevel;
	}

	await printWranglerBanner();

	if (args.experimentalLocal) {
		logger.warn(
			"--experimental-local is no longer required and will be removed in a future version.\n`wrangler pages dev` now uses the local Cloudflare Workers runtime by default."
		);
	}

	if (args.config) {
		throw new FatalError(
			"Pages does not support custom paths for the `wrangler.toml` configuration file",
			1
		);
	}

	if (args.experimentalJsonConfig) {
		throw new FatalError("Pages does not support `wrangler.json`", 1);
	}

	if (args.env) {
		throw new FatalError(
			"Pages does not support targeting an environment with the --env flag. Use the --branch flag to target your production or preview branch",
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
	const config = readConfig(undefined, { ...args, env: undefined });
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
	// TODO: Here lies a known bug. If you specify both `--bundle` and `--no-bundle`, this behavior is undefined and you will get unexpected results.
	// There is no sane way to get the true value out of yargs, so here we are.
	const enableBundling = args.bundle ?? !args.noBundle;

	const functionsDirectory = "./functions";
	let usingFunctions = !usingWorkerScript && existsSync(functionsDirectory);

	let scriptPath = "";

	const nodejsCompatMode = validateNodeCompat({
		legacyNodeCompat: args.nodeCompat,
		compatibilityFlags:
			args.compatibilityFlags ?? config.compatibility_flags ?? [],
		noBundle: args.noBundle ?? config.no_bundle ?? false,
	});

	const defineNavigatorUserAgent = isNavigatorDefined(
		compatibilityDate,
		compatibilityFlags
	);
	let modules: CfModule[] = [];

	if (usingWorkerDirectory) {
		const runBuild = async () => {
			const bundleResult = await produceWorkerBundleForWorkerJSDirectory({
				workerJSDirectory: workerScriptPath,
				bundle: enableBundling,
				buildOutputDirectory: directory ?? ".",
				nodejsCompatMode,
				defineNavigatorUserAgent,
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
				try {
					await buildRawWorker({
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
					});
				} catch (e: unknown) {
					logger.warn("Failed to bundle _worker.js.", e);
				}
			};
		}

		await runBuild();
		watch([workerScriptPath], {
			persistent: true,
			ignoreInitial: true,
		}).on("all", async (event) => {
			if (event === "unlink") {
				return;
			}
			await runBuild();
		});
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
		try {
			const buildFn = async () => {
				await buildFunctions({
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
				});
				await metrics.sendMetricsEvent("build pages functions");
			};

			await buildFn();
			// If Functions found routes, continue using Functions
			watch([functionsDirectory], {
				persistent: true,
				ignoreInitial: true,
			}).on("all", async () => {
				try {
					await buildFn();
				} catch (e) {
					if (e instanceof FunctionsNoRoutesError) {
						logger.warn(
							getFunctionsNoRoutesWarning(functionsDirectory, "skipping")
						);
					} else if (e instanceof FunctionsBuildError) {
						logger.warn(
							getFunctionsBuildWarning(functionsDirectory, e.message)
						);
					} else {
						throw e;
					}
				}
			});
		} catch (e) {
			// If there are no Functions, then Pages will only serve assets.
			if (e instanceof FunctionsNoRoutesError) {
				logger.warn(
					getFunctionsNoRoutesWarning(functionsDirectory, "skipping")
				);
				// Resolve anyway and run without Functions
				onEnd();
				// Turn off Functions
				usingFunctions = false;
			} else {
				throw e;
			}
		}
	}

	// Depending on the result of building Functions, we may not actually be using
	// Functions even if the directory exists.
	if (!usingFunctions && !usingWorkerScript) {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		scriptReadyResolve!();

		logger.log("No functions. Shimming...");
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

	const { stop, waitUntilExit } = await unstable_dev(scriptEntrypoint, {
		env: undefined,
		ip,
		port,
		inspectorPort,
		localProtocol,
		httpsKeyPath: args.httpsKeyPath,
		httpsCertPath: args.httpsCertPath,
		compatibilityDate,
		compatibilityFlags,
		nodeCompat: nodejsCompatMode === "legacy",
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
		inspect: undefined,
		logLevel: args.logLevel,
		experimental: {
			processEntrypoint: true,
			additionalModules: modules,
			d1Databases: d1_databases,
			disableExperimentalWarning: true,
			enablePagesAssetsServiceBinding: {
				proxyPort,
				directory,
			},
			liveReload: args.liveReload,
			forceLocal: true,
			showInteractiveDevSession: args.showInteractiveDevSession,
			testMode: false,
			watch: true,
			fileBasedRegistry: args.experimentalRegistry,
		},
	});
	await metrics.sendMetricsEvent("run pages dev");

	CLEANUP_CALLBACKS.push(stop);

	process.on("exit", CLEANUP);
	process.on("SIGINT", CLEANUP);
	process.on("SIGTERM", CLEANUP);

	await waitUntilExit();
	CLEANUP();
	process.exit(0);
};

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
	if (command.length === 0) {
		if (port !== undefined) {
			return port;
		}

		CLEANUP();
		throw new FatalError(
			"Must specify a directory of static assets to serve, or a command to run, or a proxy port, or configure `pages_build_output_dir` in `wrangler.toml`.",
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
	args: PagesDevArguments
) {
	// resolve compatibility date
	let compatibilityDate = args.compatibilityDate || config.compatibility_date;
	if (!compatibilityDate) {
		const currentDate = new Date().toISOString().substring(0, 10);
		logger.warn(
			`No compatibility_date was specified. Using today's date: ${currentDate}.\n` +
				`❯❯ Add one to your wrangler.toml file: compatibility_date = "${currentDate}", or\n` +
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
function getBindingsFromArgs(args: PagesDevArguments): Partial<
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
			.filter(Boolean) as AdditionalDevProps["kv"];
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
			.filter(Boolean) as AdditionalDevProps["d1Databases"];
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

				return { binding, bucket_name: ref || binding.toString() };
			})
			.filter(Boolean) as AdditionalDevProps["r2"];
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
