import { execSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { watch } from "chokidar";
import { build as workerJsBuild } from "esbuild";
import { unstable_dev } from "../api";
import { FatalError } from "../errors";
import { logger } from "../logger";
import * as metrics from "../metrics";
import { buildFunctions } from "./build";
import { SECONDS_TO_WAIT_FOR_PROXY } from "./constants";
import { FunctionsNoRoutesError, getFunctionsNoRoutesWarning } from "./errors";
import { CLEANUP, CLEANUP_CALLBACKS, pagesBetaWarning } from "./utils";
import type { AdditionalDevProps } from "../dev";
import type { YargsOptionsToInterface } from "./types";
import type { Plugin } from "esbuild";
import type { Argv } from "yargs";

const DURABLE_OBJECTS_BINDING_REGEXP = new RegExp(
	/^(?<binding>[^=]+)=(?<className>[^@\s]+)(@(?<scriptName>.*)$)?$/
);

type PagesDevArgs = YargsOptionsToInterface<typeof Options>;

export function Options(yargs: Argv) {
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

			// TODO
			// For now, all Pages projects are set to 2021-11-02. We're adding compat date soon, and we can then adopt `wrangler dev`'s `default: true`.
			// However, it looks like it isn't actually connected up properly in `wrangler dev` at the moment, hence commenting this out for now.

			// latest: {
			// 	describe: "Use the latest version of the worker runtime",
			// 	type: "boolean",
			// 	default: false,
			// },

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
			do: {
				type: "array",
				description: "Durable Object to bind (--do NAME=CLASS)",
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
			"experimental-enable-local-persistence": {
				type: "boolean",
				default: false,
				describe: "Enable persistence for this session (only for local mode)",
			},
			"node-compat": {
				describe: "Enable node.js compatibility",
				default: false,
				type: "boolean",
				hidden: true,
			},
			config: {
				describe: "Pages does not support wrangler.toml",
				type: "string",
				hidden: true,
			},
		})
		.epilogue(pagesBetaWarning);
}

export const Handler = async ({
	local,
	directory,
	"compatibility-date": compatibilityDate = "2021-11-02",
	"compatibility-flags": compatibilityFlags,
	ip,
	port,
	"inspector-port": inspectorPort,
	proxy: requestedProxyPort,
	"script-path": singleWorkerScriptPath,
	binding: bindings = [],
	kv: kvs = [],
	do: durableObjects = [],
	r2: r2s = [],
	"live-reload": liveReload,
	"local-protocol": localProtocol,
	"experimental-enable-local-persistence": experimentalEnableLocalPersistence,
	"node-compat": nodeCompat,
	config: config,
	_: [_pages, _dev, ...remaining],
}: PagesDevArgs) => {
	// Beta message for `wrangler pages <commands>` usage
	logger.log(pagesBetaWarning);

	if (!local) {
		throw new FatalError("Only local mode is supported at the moment.", 1);
	}

	if (config) {
		throw new FatalError("Pages does not support wrangler.toml", 1);
	}

	const functionsDirectory = "./functions";
	let usingFunctions = existsSync(functionsDirectory);

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

	let scriptReadyResolve: () => void;
	const scriptReadyPromise = new Promise<void>(
		(promiseResolve) => (scriptReadyResolve = promiseResolve)
	);

	let scriptPath = "";

	// Try to use Functions
	if (usingFunctions) {
		const outfile = join(tmpdir(), `./functionsWorker-${Math.random()}.js`);
		scriptPath = outfile;

		if (nodeCompat) {
			console.warn(
				"Enabling node.js compatibility mode for builtins and globals. This is experimental and has serious tradeoffs. Please see https://github.com/ionic-team/rollup-plugin-node-polyfills/ for more details."
			);
		}

		logger.log(`Compiling worker to "${outfile}"...`);
		const onEnd = () => scriptReadyResolve();
		try {
			await buildFunctions({
				outfile,
				functionsDirectory,
				sourcemap: true,
				watch: true,
				onEnd,
				buildOutputDirectory: directory,
				nodeCompat,
			});
			await metrics.sendMetricsEvent("build pages functions");

			// If Functions found routes, continue using Functions
			watch([functionsDirectory], {
				persistent: true,
				ignoreInitial: true,
			}).on("all", async () => {
				try {
					await buildFunctions({
						outfile,
						functionsDirectory,
						sourcemap: true,
						watch: true,
						onEnd,
						buildOutputDirectory: directory,
						nodeCompat,
					});
					await metrics.sendMetricsEvent("build pages functions");
				} catch (e) {
					if (e instanceof FunctionsNoRoutesError) {
						logger.warn(
							getFunctionsNoRoutesWarning(functionsDirectory, "skipping")
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
	if (!usingFunctions) {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		scriptReadyResolve!();

		scriptPath =
			directory !== undefined
				? join(directory, singleWorkerScriptPath)
				: singleWorkerScriptPath;

		if (!existsSync(scriptPath)) {
			logger.log("No functions. Shimming...");
			scriptPath = resolve(__dirname, "../templates/pages-shim.ts");
		} else {
			const runBuild = async () => {
				try {
					await workerJsBuild({
						entryPoints: [scriptPath],
						write: false,
						plugins: [blockWorkerJsImports],
					});
				} catch {}
			};
			await runBuild();
			watch([scriptPath], {
				persistent: true,
				ignoreInitial: true,
			}).on("all", async () => {
				await runBuild();
			});
		}
	}

	await scriptReadyPromise;

	if (scriptPath === "") {
		// Failed to get a script with or without Functions,
		// something really bad must have happend.
		throw new FatalError(
			"Failed to start wrangler pages dev due to an unknown error",
			1
		);
	}

	const { stop, waitUntilExit } = await unstable_dev(
		scriptPath,
		{
			ip,
			port,
			inspectorPort,
			watch: true,
			localProtocol,
			liveReload,
			compatibilityDate,
			compatibilityFlags,
			nodeCompat,
			vars: Object.fromEntries(
				bindings
					.map((binding) => binding.toString().split("="))
					.map(([key, ...values]) => [key, values.join("=")])
			),
			kv: kvs.map((val) => ({
				binding: val.toString(),
				id: "",
			})),
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
			r2: r2s.map((binding) => {
				return { binding: binding.toString(), bucket_name: "" };
			}),

			enablePagesAssetsServiceBinding: {
				proxyPort,
				directory,
			},
			forceLocal: true,
			experimentalEnableLocalPersistence,
			showInteractiveDevSession: undefined,
			inspect: true,
			logLevel: "error",
			logPrefix: "pages",
		},
		true
	);
	await metrics.sendMetricsEvent("run pages dev");

	CLEANUP_CALLBACKS.push(stop);

	waitUntilExit().then(() => {
		CLEANUP();
		process.exit(0);
	});

	process.on("exit", CLEANUP);
	process.on("SIGINT", CLEANUP);
	process.on("SIGTERM", CLEANUP);
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
		CLEANUP();
		throw new FatalError(
			"Must specify a directory of static assets to serve or a command to run.",
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

const blockWorkerJsImports: Plugin = {
	name: "block-worker-js-imports",
	setup(build) {
		build.onResolve({ filter: /.*/g }, (_args) => {
			logger.error(
				`_worker.js is importing from another file. This will throw an error if deployed.\nYou should bundle your Worker or remove the import if it is unused.`
			);
			return null;
		});
	},
};
