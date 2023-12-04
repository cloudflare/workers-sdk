import assert from "node:assert";
import crypto from "node:crypto";
import events from "node:events";
import path from "node:path";
import util from "node:util";
import { createBirpc } from "birpc";
import * as devalue from "devalue";
import {
	Log,
	LogLevel,
	Miniflare,
	WebSocket,
	structuredSerializableReducers,
	structuredSerializableRevivers,
} from "miniflare";
import { createMethodsRPC } from "vitest/node";
import { OPTIONS_PATH, parseProjectOptions } from "./config";
import { handleLoopbackRequest } from "./loopback";
import { handleModuleFallbackRequest, modulesRoot } from "./module-fallback";
import type { WorkersProjectOptions } from "./config";
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
const DIST_PATH = path.resolve(__dirname, "..");
const POOL_WORKER_PATH = path.join(DIST_PATH, "worker", "index.mjs");

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
		// TODO(soon): should ideally wrap these in `readline` interfaces if
		//  intercepting like this
		const s = chunk.toString();
		if (ignoreMessages.some((message) => s.includes(message))) {
			return;
		}
		process.stderr.write(chunk);
	});
}

let mf: Miniflare | undefined;
let previousMfOptions: MiniflareOptions | undefined;

interface ProjectSpecs {
	project: WorkspaceProject;
	options: WorkersProjectOptions;
	testFiles: Set<string>;
}
const allProjectSpecs = new Map<string /* projectName */, ProjectSpecs>();

// User worker names must not start with this
const RUNNER_WORKER_NAME_PREFIX = "vitest-pool-workers:";
function getWorkspaceRunnerWorkerName(project: WorkspaceProject) {
	return `${RUNNER_WORKER_NAME_PREFIX}runner:${project.getName()}`;
}
function getSpecRunnerWorkerName(project: WorkspaceProject, testFile: string) {
	const workspaceName = getWorkspaceRunnerWorkerName(project);
	const testFileHash = crypto.createHash("sha1").update(testFile).digest("hex");
	testFile = testFile.replace(/[^a-z0-9-]/gi, "_");
	return `${workspaceName}:${testFileHash}:${testFile}`;
}

function isDurableObjectDesignatorToSelf(
	value: unknown
): value is string | { className: string } {
	// Either this is a simple `string` designator to the current worker...
	if (typeof value === "string") return true;
	// ...or it's an object designator without a `scriptName`. We're assuming the
	// user isn't able to guess the current worker name, so if a `scriptName` is
	// set, the designator is definitely for another worker.
	return (
		typeof value === "object" &&
		value !== null &&
		"className" in value &&
		typeof value.className === "string" &&
		//
		(!("scriptName" in value) || value.scriptName === undefined)
	);
}

// Returns the bound names for bindings to Durable Objects with classes defined
// in this worker.
function getDurableObjectBindingNamesToSelf(
	options: WorkersProjectOptions
): Set<string> {
	const result = new Set<string>();
	const durableObjects = options.miniflare.durableObjects ?? {};
	for (const [key, designator] of Object.entries(durableObjects)) {
		if (key === RUNNER_OBJECT_BINDING) continue;
		if (isDurableObjectDesignatorToSelf(designator)) result.add(key);
	}
	return result;
}

const USER_OBJECT_MODULE_NAME = "__VITEST_POOL_WORKERS_USER_OBJECT";
const USER_OBJECT_MODULE_PATH = path.join(
	path.dirname(POOL_WORKER_PATH),
	USER_OBJECT_MODULE_NAME
);
// Prefix all Durable Object class names, so they don't clash with other
// identifiers in `src/worker/index.ts`. Returns a `Set` containing original
// names of Durable Object classes defined in this worker.
function fixupDurableObjectBindingsToSelf(worker: WorkerOptions): Set<string> {
	// TODO(someday): may need to extend this to take into account other workers
	//  if doing multi-worker tests across workspace projects
	// TODO(someday): may want to validate class names are valid identifiers?
	const result = new Set<string>();
	if (worker.durableObjects === undefined) return result;
	for (const key of Object.keys(worker.durableObjects)) {
		const designator = worker.durableObjects[key];
		// `designator` hasn't been validated at this point
		if (typeof designator === "string") {
			// Either this is a simple `string` designator to the current worker...
			result.add(designator);
			worker.durableObjects[key] = USER_OBJECT_MODULE_NAME + designator;
		} else if (isDurableObjectDesignatorToSelf(designator)) {
			// ...or it's an object designator to the current worker
			result.add(designator.className);
			// Shallow clone to avoid mutating config
			worker.durableObjects[key] = {
				...designator,
				className: USER_OBJECT_MODULE_NAME + designator.className,
			};
		}
	}
	return result;
}

// Point all service bindings with empty worker name to current worker
function fixupServiceBindingsToSelf(worker: WorkerOptions) {
	assert(worker.name !== undefined);
	if (worker.serviceBindings === undefined) return;
	for (const name of Object.keys(worker.serviceBindings)) {
		if (worker.serviceBindings[name] === "") {
			worker.serviceBindings[name] = worker.name;
		}
	}
}

type ProjectWorkers = [
	runnerWorker: WorkerOptions,
	...auxiliaryWorkers: WorkerOptions[]
];

const LOOPBACK_SERVICE_BINDING = "__VITEST_POOL_WORKERS_LOOPBACK_SERVICE";
const RUNNER_OBJECT_BINDING = "__VITEST_POOL_WORKERS_RUNNER_OBJECT";

function buildProjectWorkerOptions(
	projectSpecs: Omit<ProjectSpecs, "testFiles">
): ProjectWorkers {
	const workspacePath = projectSpecs.project.path;
	const runnerWorker = projectSpecs.options.miniflare;

	// Make sure the worker has a well-known name
	runnerWorker.name = getWorkspaceRunnerWorkerName(projectSpecs.project);

	// Make sure the worker has the `nodejs_compat` and `export_commonjs_default`
	// compatibility flags enabled. Vitest makes heavy use of Node APIs, and many
	// of the libraries it depends on expect `require()` to return
	// `module.exports` directly, rather than `{ default: module.exports }`.
	runnerWorker.compatibilityFlags ??= [];
	if (runnerWorker.compatibilityFlags.includes("export_commonjs_namespace")) {
		// `export_commonjs_namespace` and `export_commonjs_default` are mutually
		// exclusive. If we have `export_commonjs_namespace` set, we can't continue.
		throw new Error(
			`In workspace ${workspacePath}, \`${OPTIONS_PATH}.miniflare.compatibilityFlags\` must not contain "export_commonjs_namespace"`
		);
	}
	if (!runnerWorker.compatibilityFlags.includes("export_commonjs_default")) {
		runnerWorker.compatibilityFlags.push("export_commonjs_default");
	}
	if (!runnerWorker.compatibilityFlags.includes("nodejs_compat")) {
		runnerWorker.compatibilityFlags.push("nodejs_compat");
	}

	// Make sure we define an unsafe eval binding and enable the fallback service
	runnerWorker.unsafeEvalBinding = "__VITEST_POOL_WORKERS_UNSAFE_EVAL";
	runnerWorker.unsafeUseModuleFallbackService = true;

	// Make sure we define our loopback service binding for helpers
	runnerWorker.serviceBindings ??= {};
	runnerWorker.serviceBindings[LOOPBACK_SERVICE_BINDING] =
		handleLoopbackRequest;

	// Build wrappers for Durable Objects defined in this worker
	runnerWorker.durableObjects ??= {};
	const durableObjectClassNames =
		fixupDurableObjectBindingsToSelf(runnerWorker);
	const durableObjectWrappers = Array.from(durableObjectClassNames)
		.sort() // Sort for deterministic output to minimise `Miniflare` restarts
		.map((className) => {
			const quotedClassName = JSON.stringify(className);
			return `export const ${USER_OBJECT_MODULE_NAME}${className} = createDurableObjectWrapper(${quotedClassName});`;
		});
	durableObjectWrappers.unshift(
		'import { createDurableObjectWrapper } from "cloudflare:test-internal";'
	);

	// Make sure we define the `RunnerObject` Durable Object
	runnerWorker.durableObjects[RUNNER_OBJECT_BINDING] = {
		className: "RunnerObject",
		unsafePreventEviction: true,
	};

	// Make sure we define the runner script, including Durable Object wrappers
	if ("script" in runnerWorker) delete runnerWorker.script;
	if ("scriptPath" in runnerWorker) delete runnerWorker.scriptPath;
	// TODO(soon): will need to consider how this works on Windows, still treat
	//  `/` as the root, then do things like `/C:/a/b/c/index.mjs`
	runnerWorker.modulesRoot = modulesRoot;
	runnerWorker.modules = [
		{ type: "ESModule", path: POOL_WORKER_PATH },
		{
			type: "ESModule",
			path: USER_OBJECT_MODULE_PATH,
			contents: durableObjectWrappers.join("\n"),
		},
	];

	// Build array of workers contributed by the workspace
	const workers: ProjectWorkers = [runnerWorker];
	if (runnerWorker.workers !== undefined) {
		// Try to add workers defined by the user
		for (let i = 0; i < runnerWorker.workers.length; i++) {
			const worker: unknown = runnerWorker.workers[i];
			// Make sure the worker has a non-empty name...
			if (
				typeof worker !== "object" ||
				worker === null ||
				!("name" in worker) ||
				typeof worker.name !== "string" ||
				worker.name === ""
			) {
				throw new Error(
					`In workspace ${workspacePath}, \`${OPTIONS_PATH}.miniflare.workers[${i}].name\` must be non-empty`
				);
			}
			// ...that doesn't start with our reserved prefix
			if (worker.name.startsWith(RUNNER_WORKER_NAME_PREFIX)) {
				throw new Error(
					`In workspace ${workspacePath}, \`${OPTIONS_PATH}.miniflare.workers[${i}].name\` must not start with "${RUNNER_WORKER_NAME_PREFIX}", got ${worker.name}`
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
	for (const project of allProjectSpecs.values()) {
		const [runnerWorker, ...auxiliaryWorkers] =
			buildProjectWorkerOptions(project);
		assert(runnerWorker.name?.startsWith(RUNNER_WORKER_NAME_PREFIX));

		if (project.options.singleWorker) {
			// Just add the runner worker once if using a single worker for all tests
			fixupServiceBindingsToSelf(runnerWorker);
			workers.push(runnerWorker);
		} else {
			// Otherwise, duplicate the runner worker for each test file
			for (const testFile of project.testFiles) {
				const testFileWorker = { ...runnerWorker };
				testFileWorker.name = getSpecRunnerWorkerName(
					project.project,
					testFile
				);
				fixupServiceBindingsToSelf(testFileWorker);
				workers.push(testFileWorker);
			}
		}

		// Add any other workers the user has defined once
		workers.push(...auxiliaryWorkers);
	}
	return {
		log: mfLog,
		verbose: true,
		unsafeModuleFallbackService: handleModuleFallbackRequest,
		handleRuntimeStdio,
		workers,
	};
}

function maybeGetResolvedMainPath(
	projectSpecs: ProjectSpecs
): string | undefined {
	const workspacePath = projectSpecs.project.path;
	const main = projectSpecs.options.main;
	if (main === undefined) return;
	if (typeof workspacePath === "string") {
		return path.resolve(path.dirname(workspacePath), main);
	} else {
		return path.resolve(main);
	}
}

type MiniflareDurableObjectNamespace = Awaited<
	ReturnType<Miniflare["getDurableObjectNamespace"]>
>;
async function runTests(
	ctx: Vitest,
	runnerNs: MiniflareDurableObjectNamespace,
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

	const id = runnerNs.idFromName("");
	const stub = runnerNs.get(id);
	const res = await stub.fetch("http://placeholder", {
		headers: {
			Upgrade: "websocket",
			"MF-Vitest-Worker-Data": structuredSerializableStringify({
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
			// Always mark `cloudflare:*` modules as external
			if (args[0].startsWith("cloudflare:")) return { externalize: args[0] };
			return localRpcFunctions.fetch(...args);
		},
	};
	const rpc = createBirpc<RunnerRPC, RuntimeRPC>(patchedLocalRpcFunctions, {
		eventNames: ["onCancel"],
		post(value) {
			if (webSocket.readyState === WebSocket.READY_STATE_OPEN) {
				debuglog("POOL-->WORKER", value);
				webSocket.send(structuredSerializableStringify(value));
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
			// TODO(soon): will probably want to reset all storage here, up to `setup(env)` hook end state?

			// 1. Collect new specs
			const parsedProjectOptions = new Set<WorkspaceProject>();
			for (const [project, testFile] of specs) {
				// Vitest validates all project names are unique
				const projectName = project.getName();
				let projectSpecs = allProjectSpecs.get(projectName);
				if (projectSpecs === undefined) {
					projectSpecs = {
						project,
						options: { miniflare: { script: "" } },
						testFiles: new Set(),
					};
					allProjectSpecs.set(projectName, projectSpecs);
				}
				// Parse project options once per project per re-run
				if (!parsedProjectOptions.has(project)) {
					parsedProjectOptions.add(project);
					projectSpecs.options = parseProjectOptions(projectSpecs.project);
				}
				projectSpecs.project = project;
				projectSpecs.testFiles.add(testFile);
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
			for (const [project, specsToRun] of specsByProject) {
				const projectSpecs = allProjectSpecs.get(project.getName());
				assert(projectSpecs !== undefined); // Defined earlier in this function
				const options = projectSpecs.options;

				const config = project.getSerializableConfig();

				// Use our custom test runner
				config.runner = "cloudflare:test-runner";

				// Make sure `setImmediate` and `clearImmediate` are never faked as they
				// don't exist on the workers global scope
				config.fakeTimers.toFake = config.fakeTimers.toFake?.filter(
					(method) => method !== "setImmediate" && method !== "clearImmediate"
				);

				// Allow workers to be re-used by removing the isolation requirement
				config.poolOptions ??= {};
				config.poolOptions.threads ??= {};
				config.poolOptions.threads.isolate = false;

				// Include resolved `main` if defined, and the names of Durable Object
				// bindings that point to classes in the current isolate in the
				// serialized config
				const main = maybeGetResolvedMainPath(projectSpecs);
				const isolateDurableObjectBindings = Array.from(
					getDurableObjectBindingNamesToSelf(projectSpecs.options)
				);
				config.poolOptions.workers = { main, isolateDurableObjectBindings };

				if (options.singleWorker) {
					const workerName = getWorkspaceRunnerWorkerName(project);
					const ns = await mf.getDurableObjectNamespace(
						RUNNER_OBJECT_BINDING,
						workerName
					);
					const files = specsToRun.map(([, file]) => file);
					resultPromises.push(
						runTests(ctx, ns, project, config, files, invalidates)
					);
				} else {
					for (const [, file] of specsToRun) {
						const workerName = getSpecRunnerWorkerName(project, file);
						const ns = await mf.getDurableObjectNamespace(
							RUNNER_OBJECT_BINDING,
							workerName
						);
						resultPromises.push(
							runTests(ctx, ns, project, config, [file], invalidates)
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

			// TODO(soon): something like this is required for watching non-statically imported deps,
			//   `vitest/dist/vendor/node.c-kzGvOB.js:handleFileChanged` is interesting,
			//   could also use `forceRerunTriggers`
			//   (Vite statically analyses imports here: https://github.com/vitejs/vite/blob/2649f40733bad131bc94b06d370bedc8f57853e2/packages/vite/src/node/plugins/importAnalysis.ts#L770)
			// const project = specs[0][0];
			// const moduleGraph = project.server.moduleGraph;
			// const testModule = moduleGraph.getModuleById(".../packages/vitest-pool-workers/test/kv/store.test.ts");
			// const thingModule = moduleGraph.getModuleById(".../packages/vitest-pool-workers/test/kv/thing.ts");
			// assert(testModule && thingModule);
			// thingModule.importers.add(testModule);
		},
		close() {
			log.debug("Shutting down Cloudflare Workers runtime...");
			const disposePromise = mf?.dispose();
			mf = undefined;
			return disposePromise;
		},
	};
}

// TODO: consider adding named exports for utilities like applying D1 migrations
//  (e.g. `import { runD1Migrations } from "@cloudflare/vitest-pool-workers";`,
//  then call in setup)
