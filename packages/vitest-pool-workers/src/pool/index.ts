import assert from "node:assert";
import crypto from "node:crypto";
import events from "node:events";
import path from "node:path";
import util from "node:util";
import { createBirpc } from "birpc";
import * as devalue from "devalue";
import { Log, LogLevel, Miniflare, WebSocket } from "miniflare";
import { createMethodsRPC } from "vitest/node";
import { handleModuleFallbackRequest, modulesRoot } from "./module-fallback";
import type { CloseEvent, MiniflareOptions, WorkerOptions } from "miniflare";
import type { MessagePort } from "node:worker_threads";
import type { Readable } from "node:stream";
import type {
	ResolvedConfig,
	RunnerRPC,
	RuntimeRPC,
	WorkerContext,
} from "vitest";
import type { ProcessPool, Vitest, WorkspaceProject } from "vitest/node";

function groupBy<K, V>(
	iterable: Iterable<V>,
	keyFn: (value: V) => K
): Map<K, V[]> {
	const result = new Map<K, V[]>();
	for (const value of iterable) {
		const key = keyFn(value);
		let group = result.get(key);
		if (group === undefined) result.set(key, (group = []));
		group.push(value);
	}
	return result;
}

function structuredSerializableStringify(value: unknown): string {
	return devalue.stringify(value, structuredSerializableReducers);
}
function structuredSerializableParse(value: string): unknown {
	return devalue.parse(value, structuredSerializableRevivers);
}

// Log for verbose debug messages (e.g. RPC messages)
let debuglog: util.DebugLoggerFunction = util.debuglog(
	"vitest-pool-workers:index",
	(fn) => (debuglog = fn)
);
// Log for informational pool messages
const log = new Log(LogLevel.VERBOSE, { prefix: "vpw" });
// Log for Miniflare instances, used for user code warnings/errors
const mfLog = new Log(LogLevel.WARN);

// Building to an ES module, but Vite will provide `__dirname`
const distPath = path.resolve(__dirname, "..");
const poolWorkerPath = path.join(distPath, "worker", "index.mjs");

const ignoreMessages = [
	// Intentionally returning not found here to load module from root
	"error: Fallback service failed to fetch module; payload = load from root",
	// Not user actionable
	// "warning: Not symbolizing stack traces because $LLVM_SYMBOLIZER is not set.",
	// Logged when closing the WebSocket
	// TODO(someday): this is normal operation and really shouldn't error
	"disconnected: operation canceled",
	"disconnected: worker_do_not_log; Request failed due to internal error",
	"disconnected: WebSocket was aborted",
];
function handleRuntimeStdio(stdout: Readable, stderr: Readable): void {
	stdout.on("data", (chunk) => {
		process.stdout.write(chunk);
	});
	stderr.on("data", (chunk) => {
		const s = chunk.toString();
		if (ignoreMessages.some((message) => s.includes(message))) {
			return;
		}
		process.stderr.write(chunk);
	});
}

let mf: Miniflare | undefined;
let previousMfOptions: MiniflareOptions | undefined;

interface WorkspaceSpecs {
	project: WorkspaceProject;
	testFiles: Set<string>;
}
const allWorkspaceSpecs = new Map<string /* name */, WorkspaceSpecs>();

// User worker names must not start with this
const WORKER_NAME_PREFIX = "vitest-pool-workers:";
function getWorkspaceRunnerWorkerName(project: WorkspaceProject) {
	return `${WORKER_NAME_PREFIX}runner:${project.getName()}`;
}
function getSpecRunnerWorkerName(project: WorkspaceProject, testFile: string) {
	const workspaceName = getWorkspaceRunnerWorkerName(project);
	const testFileHash = crypto.createHash("sha1").update(testFile).digest("hex");
	testFile = testFile.replace(/[^a-z0-9-]/gi, "_");
	return `${workspaceName}:${testFileHash}:${testFile}`;
}

function usingSingleWorker(project: WorkspaceProject) {
	const userOptions = project.config.poolOptions?.miniflare;
	return (
		typeof userOptions === "object" &&
		userOptions !== null &&
		"singleWorker" in userOptions &&
		userOptions.singleWorker === true
	);
}

function buildWorkspaceWorkerOptions(
	workspace: WorkspaceSpecs
): WorkerOptions[] {
	const workspacePath = workspace.project.path;
	const userOptions = workspace.project.config.poolOptions?.miniflare;
	if (userOptions !== undefined && typeof userOptions !== "object") {
		throw new Error(
			`In workspace ${workspacePath}, \`poolOptions.miniflare\` must be an object, got ${typeof userOptions}`
		);
	}
	const runnerWorker = {
		// Miniflare will validate these options
		...userOptions,
	} as WorkerOptions & { workers?: unknown };

	// Make sure the worker has a well-known name
	runnerWorker.name = getWorkspaceRunnerWorkerName(workspace.project);

	// Make sure the worker has the `nodejs_compat` and `export_commonjs_default`
	// compatibility flags enabled. Vitest makes heavy use of Node APIs, and many
	// of the libraries it depends on expect `require()` to return
	// `module.exports` directly, rather than `{ default: module.exports }`.
	runnerWorker.compatibilityFlags ??= [];
	if (!Array.isArray(runnerWorker.compatibilityFlags)) {
		throw new Error(
			`In workspace ${workspacePath}, \`poolOptions.miniflare.compatibilityFlags\` must be an array, got ${typeof runnerWorker.compatibilityFlags}`
		);
	}
	// Shallow clone to avoid mutating config
	runnerWorker.compatibilityFlags = [...runnerWorker.compatibilityFlags];
	if (runnerWorker.compatibilityFlags.includes("export_commonjs_namespace")) {
		// `export_commonjs_namespace` and `export_commonjs_default` are mutually
		// exclusive. If we have `export_commonjs_namespace` set, we can't continue.
		throw new Error(
			`In workspace ${workspacePath}, \`poolOptions.miniflare.compatibilityFlags\` must not contain "export_commonjs_namespace"`
		);
	}
	if (!runnerWorker.compatibilityFlags.includes("export_commonjs_default")) {
		runnerWorker.compatibilityFlags.push("export_commonjs_default");
	}
	if (!runnerWorker.compatibilityFlags.includes("nodejs_compat")) {
		runnerWorker.compatibilityFlags.push("nodejs_compat");
	}

	// Make sure we define the runner script
	// @ts-expect-error `script` is required if defined, but we're overwriting it
	if ("script" in runnerWorker) delete runnerWorker.script;
	if ("scriptPath" in runnerWorker) delete runnerWorker.scriptPath;
	// TODO(soon): will need to consider how this works on Windows, still treat
	//  `/` as the root, then do things like `/C:/a/b/c/index.mjs`
	runnerWorker.modulesRoot = modulesRoot;
	runnerWorker.modules = [{ type: "ESModule", path: poolWorkerPath }];

	// Make sure we define the `RunnerObject` Durable Object
	if (
		runnerWorker.durableObjects !== undefined &&
		typeof runnerWorker.durableObjects !== "object"
	) {
		throw new Error(
			`In workspace ${workspacePath}, \`poolOptions.miniflare.durableObjects\` must be an object, got ${typeof runnerWorker.durableObjects}`
		);
	}
	// Shallow clone to avoid mutating config
	runnerWorker.durableObjects = { ...runnerWorker.durableObjects };
	runnerWorker.durableObjects["__VITEST_POOL_WORKERS_RUNNER_OBJECT"] = {
		className: "RunnerObject",
		unsafePreventEviction: true,
	};

	// Make sure we define an unsafe eval binding and enable the fallback service
	runnerWorker.unsafeEvalBinding = "__VITEST_POOL_WORKERS_UNSAFE_EVAL";
	runnerWorker.unsafeUseModuleFallbackService = true;

	// Build array of workers contributed by the workspace
	const workers: WorkerOptions[] = [runnerWorker];
	if (runnerWorker.workers !== undefined) {
		// Try to add workers defined by the user
		if (!Array.isArray(runnerWorker.workers)) {
			throw new Error(
				`In workspace ${workspacePath}, \`poolOptions.miniflare.workers\` must be an array, got ${typeof runnerWorker.workers}`
			);
		}
		for (let i = 0; i < runnerWorker.workers.length; i++) {
			const worker: unknown = runnerWorker.workers[i];
			// Make sure the worker's name doesn't start with our reserved prefix
			if (
				typeof worker === "object" &&
				worker !== null &&
				"name" in worker &&
				typeof worker.name === "string" &&
				worker.name.startsWith(WORKER_NAME_PREFIX)
			) {
				throw new Error(
					`In workspace ${workspacePath}, \`poolOptions.miniflare.workers[${i}].name\` must not start with "${WORKER_NAME_PREFIX}", got ${worker.name}`
				);
			}
			// Miniflare will validate these options
			workers.push(worker as WorkerOptions);
		}
		delete runnerWorker.workers;
	}

	return workers;
}

function buildMiniflareOptions(): MiniflareOptions {
	const workers: WorkerOptions[] = [];
	for (const workspace of allWorkspaceSpecs.values()) {
		const [runnerWorker, ...otherWorkers] =
			buildWorkspaceWorkerOptions(workspace);
		assert(runnerWorker.name?.startsWith(WORKER_NAME_PREFIX));

		if (usingSingleWorker(workspace.project)) {
			// Just add the runner worker once if using a single worker for all tests
			workers.push(runnerWorker);
		} else {
			// Otherwise, duplicate the runner worker for each test file
			for (const testFile of workspace.testFiles) {
				const testFileWorker = { ...runnerWorker };
				testFileWorker.name = getSpecRunnerWorkerName(
					workspace.project,
					testFile
				);
				workers.push(testFileWorker);
			}
		}

		// Add any other workers the user has defined once
		workers.push(...otherWorkers);
	}
	return {
		log: mfLog,
		verbose: true,
		unsafeModuleFallbackService: handleModuleFallbackRequest,
		handleRuntimeStdio,
		workers,
	};
}

type MiniflareFetcher = Awaited<ReturnType<Miniflare["getWorker"]>>;
async function runTests(
	ctx: Vitest,
	fetcher: MiniflareFetcher,
	project: WorkspaceProject,
	config: ResolvedConfig,
	files: string[],
	invalidates: string[] = []
) {
	ctx.state.clearFiles(project, files);
	const data: WorkerContext = {
		port: undefined as unknown as MessagePort,
		config,
		files,
		invalidates,
		environment: { name: "node", options: null },
		workerId: 0,
		projectName: project.getName(),
		providedContext: project.getProvidedContext(),
	};

	const res = await fetcher.fetch("http://placeholder", {
		headers: {
			Upgrade: "websocket",
			"MF-Vitest-Worker-Data": devalue.stringify({
				filePath: ctx.projectFiles.workerPath,
				name: "run",
				data,
			}),
		},
	});
	const webSocket = res.webSocket;
	assert(webSocket !== null);

	const localRpcFunctions = createMethodsRPC(project);
	const patchedLocalRpcFunctions: RuntimeRPC = {
		...localRpcFunctions,
		async fetch(...args) {
			// Always mark `cloudflare:test` as external
			if (args[0] === "cloudflare:test") return { externalize: args[0] };
			return localRpcFunctions.fetch(...args);
		},
	};
	const rpc = createBirpc<RunnerRPC, RuntimeRPC>(patchedLocalRpcFunctions, {
		eventNames: ["onCancel"],
		post(value) {
			if (webSocket.readyState === WebSocket.READY_STATE_OPEN) {
				debuglog("POOL-->WORKER", value);
				webSocket.send(devalue.stringify(value));
			} else {
				debuglog("POOL--*      ", value);
			}
		},
		on(listener) {
			webSocket.addEventListener("message", (event) => {
				assert(typeof event.data === "string");
				const value = structuredSerializableParse(event.data);
				debuglog("POOL<--WORKER", value);
				listener(value);
			});
		},
	});
	project.ctx.onCancel((reason) => rpc.onCancel(reason));
	webSocket.accept();

	const [event] = (await events.once(webSocket, "close")) as [CloseEvent];
	if (webSocket.readyState === WebSocket.READY_STATE_CLOSING) {
		if (event.code === 1005 /* No Status Received */) {
			webSocket.close();
		} else {
			webSocket.close(event.code, event.reason);
		}
	}
	if (event.code !== 1000) {
		// TODO(soon): could we get the actual error here, use birpc custom event
		//  and throw with deferred promise
		throw new Error("Failed to run tests");
	}

	debuglog("DONE", files);

	// TODO(now): implement cancellation, can simulate this by CTRL-C'ing while
	//  tests are running
	// try {
	// 	await pool.run(data, { transferList: [workerPort], name: "run" });
	// } catch (error) {
	// 	// Worker got stuck and won't terminate - this may cause process to hang
	// 	if (
	// 		error instanceof Error &&
	// 		/Failed to terminate worker/.test(error.message)
	// 	)
	// 		ctx.state.addProcessTimeoutCause(
	// 			`Failed to terminate worker while running ${files.join(", ")}.`
	// 		);
	// 	// Intentionally cancelled
	// 	else if (
	// 		ctx.isCancelling &&
	// 		error instanceof Error &&
	// 		/The task has been cancelled/.test(error.message)
	// 	)
	// 		ctx.state.cancelFiles(files, ctx.config.root, project.getName());
	// 	else throw error;
	// } finally {
	// 	port.close();
	// 	workerPort.close();
	// }
}

export default function (ctx: Vitest): ProcessPool {
	return {
		name: "vitest-pool-workers",
		async runTests(specs, invalidates) {
			// 1. Collect new specs
			for (const [project, testFile] of specs) {
				// Vitest validates all project names are unique
				const projectName = project.getName();
				let workspaceSpecs = allWorkspaceSpecs.get(projectName);
				if (workspaceSpecs === undefined) {
					workspaceSpecs = { project, testFiles: new Set() };
					allWorkspaceSpecs.set(projectName, workspaceSpecs);
				}
				workspaceSpecs.project = project;
				workspaceSpecs.testFiles.add(testFile);
			}

			// 2. Generate Miniflare options required to run all collected specs.
			//
			//    We include *all specs* here, even those we're not planning to run,
			//    or that have been deleted. This ensures we minimise the number of
			//    Miniflare instance restarts. These invalidate all test runs, and
			//    require us to initialise all Vitest workers again with lots of
			//    requests to the module fallback service.
			//
			//    We also use a single Miniflare instance for all workspaces to allow
			//    service bindings between workspaces in the future.
			const mfOptions = buildMiniflareOptions();

			// 3. Restart Miniflare instance only if required options are different
			const changed = !util.isDeepStrictEqual(previousMfOptions, mfOptions);
			previousMfOptions = mfOptions;
			if (mf === undefined) {
				log.info("Starting Cloudflare Workers runtime...");
				mf = new Miniflare(mfOptions);
				await mf.ready;
			} else if (changed) {
				log.info("Restarting Cloudflare Workers runtime...");
				await mf.setOptions(mfOptions);
			} else {
				log.debug("Reusing Cloudflare Workers runtime...");
			}

			// 4. Run just the required tests
			const resultPromises: Promise<void>[] = [];
			const specsByProject = groupBy(specs, ([project]) => project);
			for (const [project, projectSpecs] of specsByProject) {
				const singleWorker = usingSingleWorker(project);
				const config = project.getSerializableConfig();
				// Allow workers to be re-used by removing the isolation requirement
				config.poolOptions ??= {};
				config.poolOptions.threads ??= {};
				config.poolOptions.threads.isolate = false;

				if (singleWorker) {
					const workerName = getWorkspaceRunnerWorkerName(project);
					const fetcher = await mf.getWorker(workerName);
					const files = projectSpecs.map(([, file]) => file);
					resultPromises.push(
						runTests(ctx, fetcher, project, config, files, invalidates)
					);
				} else {
					for (const [, file] of projectSpecs) {
						const workerName = getSpecRunnerWorkerName(project, file);
						const fetcher = await mf.getWorker(workerName);
						resultPromises.push(
							runTests(ctx, fetcher, project, config, [file], invalidates)
						);
					}
				}
			}

			// 5. Wait for all tests to complete, and throw if any failed
			const results = await Promise.allSettled(resultPromises);
			const errors = results
				.filter((r): r is PromiseRejectedResult => r.status === "rejected")
				.map((r) => r.reason);
			if (errors.length > 0) {
				throw new AggregateError(
					errors,
					"Errors occurred while running tests. For more information, see serialized error."
				);
			}
		},
		close() {
			const disposePromise = mf?.dispose();
			mf = undefined;
			return disposePromise;
		},
	};
}
