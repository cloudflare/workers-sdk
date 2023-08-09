import { execSync, spawn } from "node:child_process";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { watch } from "chokidar";
import * as esbuild from "esbuild";
import { unstable_dev } from "../api";
import { isBuildFailure } from "../deployment-bundle/build-failures";
import { esbuildAliasExternalPlugin } from "../deployment-bundle/esbuild-plugins/alias-external";
import { FatalError } from "../errors";
import { logger } from "../logger";
import * as metrics from "../metrics";
import { getBasePath } from "../paths";
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
	traverseAndBuildWorkerJSDirectory,
} from "./functions/buildWorker";
import { validateRoutes } from "./functions/routes-validation";
import { CLEANUP, CLEANUP_CALLBACKS, realTmpdir } from "./utils";
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
			description: "The proxy command to run",
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
				default: "0.0.0.0",
				description: "The IP address to listen on",
			},
			port: {
				type: "number",
				default: 8788,
				description: "The port to listen on (serve from)",
			},
			"inspector-port": {
				type: "number",
				describe: "Port for devtools to connect to",
			},
			proxy: {
				type: "number",
				description: "The port to proxy (where the static assets are served)",
			},
			"script-path": {
				type: "string",
				default: "_worker.js",
				description:
					"The location of the single Worker script if not using functions",
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
			"live-reload": {
				type: "boolean",
				default: false,
				description: "Auto reload HTML pages when change is detected",
			},
			"local-protocol": {
				describe: "Protocol to listen to requests on, defaults to http.",
				choices: ["http", "https"] as const,
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
				describe: "Pages does not support wrangler.toml",
				type: "string",
				hidden: true,
			},
			"log-level": {
				choices: ["debug", "info", "log", "warn", "error", "none"] as const,
				describe: "Specify logging level",
			},
		});
}

export const Handler = async ({
	directory,
	compatibilityDate,
	compatibilityFlags,
	ip,
	port,
	inspectorPort,
	proxy: requestedProxyPort,
	bundle,
	noBundle,
	scriptPath: singleWorkerScriptPath,
	binding: bindings = [],
	kv: kvs = [],
	do: durableObjects = [],
	d1: d1s = [],
	r2: r2s = [],
	liveReload,
	localProtocol,
	persistTo,
	nodeCompat: legacyNodeCompat,
	experimentalLocal,
	config: config,
	_: [_pages, _dev, ...remaining],
	logLevel,
}: StrictYargsOptionsToInterface<typeof Options>) => {
	if (logLevel) {
		logger.loggerLevel = logLevel;
	}

	if (experimentalLocal) {
		logger.warn(
			"--experimental-local is no longer required and will be removed in a future version.\n`wrangler pages dev` now uses the local Cloudflare Workers runtime by default."
		);
	}

	if (config) {
		throw new FatalError("Pages does not support wrangler.toml", 1);
	}

	const command = remaining;

	let proxyPort: number | undefined;

	if (directory !== undefined && command.length > 0) {
		throw new FatalError(
			"Specify either a directory OR a proxy command, not both.",
			1
		);
	} else if (directory === undefined) {
		proxyPort = await spawnProxyProcess({
			port: requestedProxyPort,
			command,
		});
		if (proxyPort === undefined) return undefined;
	} else {
		directory = resolve(directory);
	}

	if (!compatibilityDate) {
		const currentDate = new Date().toISOString().substring(0, 10);
		logger.warn(
			`No compatibility_date was specified. Using today's date: ${currentDate}.\n` +
				"Pass it in your terminal:\n" +
				"```\n" +
				`--compatibility-date=${currentDate}\n` +
				"```\n" +
				"See https://developers.cloudflare.com/workers/platform/compatibility-dates/ for more information."
		);
		compatibilityDate = currentDate;
	}

	let scriptReadyResolve: () => void;
	const scriptReadyPromise = new Promise<void>(
		(promiseResolve) => (scriptReadyResolve = promiseResolve)
	);

	const workerScriptPath =
		directory !== undefined
			? join(directory, singleWorkerScriptPath)
			: singleWorkerScriptPath;
	const usingWorkerDirectory =
		existsSync(workerScriptPath) && lstatSync(workerScriptPath).isDirectory();
	const usingWorkerScript = existsSync(workerScriptPath);
	// TODO: Here lies a known bug. If you specify both `--bundle` and `--no-bundle`, this behavior is undefined and you will get unexpected results.
	// There is no sane way to get the true value out of yargs, so here we are.
	const enableBundling = bundle ?? !noBundle;

	const functionsDirectory = "./functions";
	let usingFunctions = !usingWorkerScript && existsSync(functionsDirectory);

	let scriptPath = "";

	const nodejsCompat = compatibilityFlags?.includes("nodejs_compat");
	let modules: CfModule[] = [];

	if (usingWorkerDirectory) {
		const runBuild = async () => {
			const bundleResult = await traverseAndBuildWorkerJSDirectory({
				workerJSDirectory: workerScriptPath,
				buildOutputDirectory: directory ?? ".",
				nodejsCompat,
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
			await checkRawWorker(workerScriptPath, () => scriptReadyResolve());
		};

		if (enableBundling) {
			// We want to actually run the `_worker.js` script through the bundler
			// So update the final path to the script that will be uploaded and
			// change the `runBuild()` function to bundle the `_worker.js`.
			scriptPath = join(realTmpdir(), `./bundledWorker-${Math.random()}.mjs`);
			runBuild = async () => {
				try {
					await buildRawWorker({
						workerScriptPath: usingWorkerDirectory
							? join(workerScriptPath, "index.js")
							: workerScriptPath,
						outfile: scriptPath,
						directory: directory ?? ".",
						nodejsCompat,
						local: true,
						sourcemap: true,
						watch: false,
						onEnd: () => scriptReadyResolve(),
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
		}).on("all", async () => {
			await runBuild();
		});
	} else if (usingFunctions) {
		// Try to use Functions
		scriptPath = join(realTmpdir(), `./functionsWorker-${Math.random()}.mjs`);

		if (legacyNodeCompat) {
			console.warn(
				"Enabling Node.js compatibility mode for builtins and globals. This is experimental and has serious tradeoffs. Please see https://github.com/ionic-team/rollup-plugin-node-polyfills/ for more details."
			);
		}

		if (legacyNodeCompat && nodejsCompat) {
			throw new FatalError(
				"The `nodejs_compat` compatibility flag cannot be used in conjunction with the legacy `--node-compat` flag. If you want to use the Workers runtime Node.js compatibility features, please remove the `--node-compat` argument from your CLI command or `node_compat = true` from your config file.",
				1
			);
		}

		logger.log(`Compiling worker to "${scriptPath}"...`);
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
					legacyNodeCompat,
					nodejsCompat,
					local: true,
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
		throw new FatalError(
			"Failed to start wrangler pages dev due to an unknown error",
			1
		);
	}

	let entrypoint = scriptPath;

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

				entrypoint = join(
					realTmpdir(),
					`${Math.random().toString(36).slice(2)}.js`
				);
				await runBuild(scriptPath, entrypoint, routesJSONContents);
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
			}).on("all", async () => {
				try {
					/**
					 * Watch for _routes.json file changes and validate file each time.
					 * If file is valid proceed to running the build.
					 */
					routesJSONContents = readFileSync(routesJSONPath, "utf-8");
					validateRoutes(JSON.parse(routesJSONContents), directory as string);
					await runBuild(scriptPath, entrypoint, routesJSONContents);
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
						`Falling back to the following _routes.json default: ${JSON.stringify(
							defaultRoutesJSONSpec,
							null,
							2
						)}`
					);

					routesJSONContents = JSON.stringify(defaultRoutesJSONSpec);
					await runBuild(scriptPath, entrypoint, routesJSONContents);
				}
			});
		}
	}

	const { stop, waitUntilExit } = await unstable_dev(entrypoint, {
		ip,
		port,
		inspectorPort,
		localProtocol,
		compatibilityDate,
		compatibilityFlags,
		nodeCompat: legacyNodeCompat,
		vars: Object.fromEntries(
			bindings
				.map((binding) => binding.toString().split("="))
				.map(([key, ...values]) => [key, values.join("=")])
		),
		kv: kvs
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
			.filter(Boolean) as AdditionalDevProps["kv"],
		durableObjects: durableObjects
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
			.filter(Boolean) as AdditionalDevProps["durableObjects"],
		r2: r2s
			.map((r2) => {
				const { binding, ref } =
					BINDING_REGEXP.exec(r2.toString())?.groups || {};

				if (!binding) {
					logger.warn("Could not parse R2 binding:", r2.toString());
					return;
				}

				return { binding, bucket_name: ref || binding.toString() };
			})
			.filter(Boolean) as AdditionalDevProps["r2"],
		rules: usingWorkerDirectory
			? [
					{
						type: "ESModule",
						globs: ["**/*.js", "**/*.mjs"],
					},
			  ]
			: undefined,
		bundle: enableBundling,
		persistTo,
		inspect: undefined,
		logLevel,
		experimental: {
			processEntrypoint: true,
			additionalModules: modules,
			d1Databases: d1s
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
				.filter(Boolean) as AdditionalDevProps["d1Databases"],
			disableExperimentalWarning: true,
			enablePagesAssetsServiceBinding: {
				proxyPort,
				directory,
			},
			liveReload,
			forceLocal: true,
			showInteractiveDevSession: undefined,
			testMode: false,
			watch: true,
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
		const drive = homedir().split(":\\")[0];
		command = drive + ":\\windows\\system32\\netstat.exe -nao";
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
		if (match) return parseInt(match[1]);
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
	if (command.length === 0) {
		if (port !== undefined) {
			return port;
		}

		CLEANUP();
		throw new FatalError(
			"Must specify a directory of static assets to serve or a command to run or a proxy port.",
			1
		);
	}

	logger.log(`Running ${command.join(" ")}...`);
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
