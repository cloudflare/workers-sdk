import assert from "node:assert";
import crypto from "node:crypto";
import events from "node:events";
import fs from "node:fs";
import path from "node:path";
import util from "node:util";
import type { ProvidedEnv } from "cloudflare:test";
import { createBirpc } from "birpc";
import * as devalue from "devalue";
import {
	Log,
	LogLevel,
	Miniflare,
	structuredSerializableReducers,
	structuredSerializableRevivers,
	WebSocket,
	kUnsafeEphemeralUniqueKey,
} from "miniflare";
import { createMethodsRPC } from "vitest/node";
import { OPTIONS_PATH, parseProjectOptions } from "./config";
import { isFileNotFoundError, WORKER_NAME_PREFIX } from "./helpers";
import {
	ABORT_ALL_WORKER,
	handleLoopbackRequest,
	scheduleStorageReset,
	waitForStorageReset,
} from "./loopback";
import {
	ensurePosixLikePath,
	handleModuleFallbackRequest,
} from "./module-fallback";
import type { WorkersProjectOptions, SourcelessWorkerOptions } from "./config";
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

function groupBy<K, VFrom, VTo>(
	iterable: Iterable<VFrom>,
	keyFn: (value: VFrom) => K,
	valueFn: (value: VFrom) => VTo
): Map<K, VTo[]> {
	const result = new Map<K, VTo[]>();
	for (const value of iterable) {
		const key = keyFn(value);
		let group = result.get(key);
		if (group === undefined) result.set(key, (group = []));
		group.push(valueFn(value));
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

const symbolizerWarning =
	"warning: Not symbolizing stack traces because $LLVM_SYMBOLIZER is not set.";
const ignoreMessages = [
	// Not user actionable
	// TODO(someday): this is normal operation and really shouldn't error
	"disconnected: operation canceled",
	"disconnected: worker_do_not_log; Request failed due to internal error",
	"disconnected: WebSocket was aborted",
];
function trimSymbolizerWarning(chunk: string): string {
	return chunk.includes(symbolizerWarning)
		? chunk.substring(chunk.indexOf("\n") + 1)
		: chunk;
}
function handleRuntimeStdio(stdout: Readable, stderr: Readable): void {
	stdout.on("data", (chunk: Buffer) => {
		process.stdout.write(chunk);
	});
	stderr.on("data", (chunk: Buffer) => {
		const str = trimSymbolizerWarning(chunk.toString());
		if (ignoreMessages.some((message) => str.includes(message))) {
			return;
		}
		process.stderr.write(str);
	});
}

type SingleOrPerTestFileMiniflare =
	| Miniflare // Single instance
	| Map<string /* testFile */, Miniflare>; // Instance per test file
function forEachMiniflare(
	mfs: SingleOrPerTestFileMiniflare,
	callback: (mf: Miniflare) => Promise<unknown>
): Promise<unknown> {
	if (mfs instanceof Miniflare) return callback(mfs);

	const promises: Promise<unknown>[] = [];
	for (const mf of mfs.values()) promises.push(callback(mf));
	return Promise.all(promises);
}

interface Project {
	project: WorkspaceProject;
	options: WorkersProjectOptions;
	testFiles: Set<string>;
	relativePath: string | number;
	mf?: SingleOrPerTestFileMiniflare;
	previousMfOptions?: MiniflareOptions;
}
const allProjects = new Map<string /* projectName */, Project>();

// User worker names must not start with this
function getRunnerName(project: WorkspaceProject, testFile?: string) {
	const name = `${WORKER_NAME_PREFIX}runner-${project.getName()}`;
	if (testFile === undefined) return name;
	const testFileHash = crypto.createHash("sha1").update(testFile).digest("hex");
	testFile = testFile.replace(/[^a-z0-9-]/gi, "_");
	return `${name}-${testFileHash}-${testFile}`;
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
		(!("scriptName" in value) || value.scriptName === undefined)
	);
}

// Returns the bound names for bindings to Durable Objects with classes defined
// in this worker.
function getDurableObjectBindingNamesToSelf(
	options: WorkersProjectOptions
): Set<string> {
	const result = new Set<string>();
	const durableObjects = options.miniflare?.durableObjects ?? {};
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
function fixupDurableObjectBindingsToSelf(
	worker: SourcelessWorkerOptions
): Set<string> {
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

type ProjectWorkers = [
	runnerWorker: WorkerOptions,
	...auxiliaryWorkers: WorkerOptions[]
];

const LOOPBACK_SERVICE_BINDING = "__VITEST_POOL_WORKERS_LOOPBACK_SERVICE";
const RUNNER_OBJECT_BINDING = "__VITEST_POOL_WORKERS_RUNNER_OBJECT";

function buildProjectWorkerOptions(
	project: Omit<Project, "testFiles">
): ProjectWorkers {
	const runnerWorker = project.options.miniflare ?? {};

	// Make sure the worker has a well-known name
	runnerWorker.name = getRunnerName(project.project);

	// Make sure the worker has the `nodejs_compat` and `export_commonjs_default`
	// compatibility flags enabled. Vitest makes heavy use of Node APIs, and many
	// of the libraries it depends on expect `require()` to return
	// `module.exports` directly, rather than `{ default: module.exports }`.
	runnerWorker.compatibilityFlags ??= [];
	if (runnerWorker.compatibilityFlags.includes("export_commonjs_namespace")) {
		// `export_commonjs_namespace` and `export_commonjs_default` are mutually
		// exclusive. If we have `export_commonjs_namespace` set, we can't continue.
		throw new Error(
			`In workspace ${project.relativePath}, \`${OPTIONS_PATH}.miniflare.compatibilityFlags\` must not contain "export_commonjs_namespace"`
		);
	}
	if (!runnerWorker.compatibilityFlags.includes("export_commonjs_default")) {
		runnerWorker.compatibilityFlags.push("export_commonjs_default");
	}
	if (!runnerWorker.compatibilityFlags.includes("nodejs_compat")) {
		runnerWorker.compatibilityFlags.push("nodejs_compat");
	}
	// Required for `workerd:unsafe` module
	if (!runnerWorker.compatibilityFlags.includes("unsafe_module")) {
		runnerWorker.compatibilityFlags.push("unsafe_module");
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
		// Make the runner object ephemeral, so it doesn't write any `.sqlite` files
		// that would disrupt stacked storage because we prevent eviction
		unsafeUniqueKey: kUnsafeEphemeralUniqueKey,
		unsafePreventEviction: true,
	};

	// Make sure we define the runner script, including Durable Object wrappers
	if ("script" in runnerWorker) delete runnerWorker.script;
	if ("scriptPath" in runnerWorker) delete runnerWorker.scriptPath;

	// We want module names to be their absolute path without the leading	slash
	// (i.e. the modules root should be the root directory). On Windows, we'd
	// like paths to include the drive letter (i.e. `/C:/a/b/c/index.mjs`).
	// Internally, Miniflare uses `path.relative(modulesRoot, path)` to compute
	// module names. Setting `modulesRoot` to a drive letter and prepending this
	// to paths ensures correct names. This requires us to specify `contents`
	// with module definitions though, as the new paths don't exist.
	// TODO(now): need to add source URL comments here to ensure those are correct
	const modulesRoot = process.platform === "win32" ? "Z:\\" : "/";
	runnerWorker.modulesRoot = modulesRoot;
	runnerWorker.modules = [
		{
			type: "ESModule",
			path: path.join(modulesRoot, POOL_WORKER_PATH),
			contents: fs.readFileSync(POOL_WORKER_PATH),
		},
		{
			type: "ESModule",
			path: path.join(modulesRoot, USER_OBJECT_MODULE_PATH),
			contents: durableObjectWrappers.join("\n"),
		},
	];

	// Build array of workers contributed by the workspace
	const workers: ProjectWorkers = [runnerWorker as WorkerOptions];
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
					`In workspace ${project.relativePath}, \`${OPTIONS_PATH}.miniflare.workers[${i}].name\` must be non-empty`
				);
			}
			// ...that doesn't start with our reserved prefix
			if (worker.name.startsWith(WORKER_NAME_PREFIX)) {
				throw new Error(
					`In workspace ${project.relativePath}, \`${OPTIONS_PATH}.miniflare.workers[${i}].name\` must not start with "${WORKER_NAME_PREFIX}", got ${worker.name}`
				);
			}

			// Miniflare will validate these options
			workers.push(worker as WorkerOptions);
		}
		delete runnerWorker.workers;
	}

	return workers;
}

const SHARED_MINIFLARE_OPTIONS: Partial<MiniflareOptions> = {
	log: mfLog,
	verbose: true,
	unsafeModuleFallbackService: handleModuleFallbackRequest,
	handleRuntimeStdio,
	unsafeStickyBlobs: true,
};
function buildProjectMiniflareOptions(project: Project): MiniflareOptions {
	const [runnerWorker, ...auxiliaryWorkers] =
		buildProjectWorkerOptions(project);

	assert(runnerWorker.name !== undefined);
	assert(runnerWorker.name.startsWith(WORKER_NAME_PREFIX));

	if (project.options.singleWorker || project.options.isolatedStorage) {
		// Single Worker, Isolated or Shared Storage
		//  --> single instance with single runner worker
		// Multiple Workers, Isolated Storage:
		//  --> multiple instances each with single runner worker
		return {
			...SHARED_MINIFLARE_OPTIONS,
			workers: [runnerWorker, ABORT_ALL_WORKER, ...auxiliaryWorkers],
		};
	} else {
		// Multiple Workers, Shared Storage:
		//  --> single instance with multiple runner workers
		const testWorkers: WorkerOptions[] = [];
		for (const testFile of project.testFiles) {
			const testWorker = { ...runnerWorker };
			testWorker.name = getRunnerName(project.project, testFile);
			testWorkers.push(testWorker);
		}
		return {
			...SHARED_MINIFLARE_OPTIONS,
			workers: [...testWorkers, ABORT_ALL_WORKER, ...auxiliaryWorkers],
		};
	}
}
async function getProjectMiniflare(
	project: Project
): Promise<SingleOrPerTestFileMiniflare> {
	const mfOptions = buildProjectMiniflareOptions(project);
	const changed = !util.isDeepStrictEqual(project.previousMfOptions, mfOptions);
	project.previousMfOptions = mfOptions;

	const previousSingleInstance = project.mf instanceof Miniflare;
	const singleInstance =
		project.options.singleWorker || !project.options.isolatedStorage;

	if (project.mf !== undefined && previousSingleInstance !== singleInstance) {
		// If isolated storage configuration has changed, reset project instances
		log.info(`Isolation changed for ${project.relativePath}, resetting...`);
		await forEachMiniflare(project.mf, (mf) => mf.dispose());
		project.mf = undefined;
	}

	if (project.mf === undefined) {
		// If `mf` is now `undefined`, create new instances
		if (singleInstance) {
			log.info(`Starting single runtime for ${project.relativePath}...`);
			project.mf = new Miniflare(mfOptions);
		} else {
			log.info(`Starting isolated runtimes for ${project.relativePath}...`);
			project.mf = new Map();
			for (const testFile of project.testFiles) {
				project.mf.set(testFile, new Miniflare(mfOptions));
			}
		}
		await forEachMiniflare(project.mf, (mf) => mf.ready);
	} else if (changed) {
		// Otherwise, update the existing instances if options have changed
		log.info(`Options changed for ${project.relativePath}, updating...`);
		await forEachMiniflare(project.mf, (mf) => mf.setOptions(mfOptions));
	} else {
		log.debug(`Reusing runtime for ${project.relativePath}...`);
	}

	return project.mf;
}

function maybeGetResolvedMainPath(project: Project): string | undefined {
	const workspacePath = project.project.path;
	const main = project.options.main;
	if (main === undefined) return;
	if (typeof workspacePath === "string") {
		return path.resolve(path.dirname(workspacePath), main);
	} else {
		return path.resolve(main);
	}
}

async function runTests(
	ctx: Vitest,
	mf: Miniflare,
	workerName: string,
	project: Project,
	config: ResolvedConfig,
	files: string[],
	invalidates: string[] = []
) {
	ctx.state.clearFiles(project.project, files);
	const data: WorkerContext = {
		port: undefined as unknown as MessagePort,
		config,
		files,
		invalidates,
		environment: { name: "node", options: null },
		workerId: 0,
		projectName: project.project.getName(),
		providedContext: project.project.getProvidedContext(),
	};

	// We reset storage at the end of tests when the user is presumably looking at
	// results. We don't need to reset storage on the first run as instances were
	// just created.
	await waitForStorageReset(mf);
	if (project.options.setupEnvironment !== undefined) {
		const env = await mf.getBindings<ProvidedEnv>(workerName);
		await project.options.setupEnvironment(env);
	}
	const ns = await mf.getDurableObjectNamespace(
		RUNNER_OBJECT_BINDING,
		workerName
	);
	// @ts-expect-error `ColoLocalActorNamespace`s are not included in types
	const stub = ns.get("singleton");

	let workerPath = ctx.projectFiles.workerPath;
	if (process.platform === "win32") {
		workerPath = `/${ensurePosixLikePath(workerPath)}`;
	}

	const res = await stub.fetch("http://placeholder", {
		headers: {
			Upgrade: "websocket",
			"MF-Vitest-Worker-Data": structuredSerializableStringify({
				filePath: workerPath,
				name: "run",
				data,
			}),
		},
	});
	const webSocket = res.webSocket;
	assert(webSocket !== null);

	const localRpcFunctions = createMethodsRPC(project.project);
	const patchedLocalRpcFunctions: RuntimeRPC = {
		...localRpcFunctions,
		async fetch(...args) {
			// Always mark `cloudflare:*`/`workerd:*` modules as external
			if (/^(cloudflare|workerd):/.test(args[0])) {
				return { externalize: args[0] };
			}
			return localRpcFunctions.fetch(...args);
		},
	};
	let startupError: unknown;
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
				if (
					typeof value === "object" &&
					value !== null &&
					"vitestPoolWorkersError" in value
				) {
					startupError = value.vitestPoolWorkersError;
				} else {
					listener(value);
				}
			});
		},
	});
	project.project.ctx.onCancel((reason) => rpc.onCancel(reason));
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
		throw startupError ?? new Error("Failed to run tests");
	}

	debuglog("DONE", files);
}

function getRelativeProjectPath(projectPath: string | number) {
	if (typeof projectPath === "number") return projectPath;
	else return path.relative("", projectPath);
}

interface PackageJson {
	version?: string;
	peerDependencies?: Record<string, string | undefined>;
}
function getPackageJson(dirPath: string): PackageJson | undefined {
	// eslint-disable-next-line no-constant-condition
	while (true) {
		const pkgJsonPath = path.join(dirPath, "package.json");
		try {
			const contents = fs.readFileSync(pkgJsonPath, "utf8");
			return JSON.parse(contents);
		} catch (e) {
			if (!isFileNotFoundError(e)) throw e;
		}
		const nextDirPath = path.dirname(dirPath);
		// `path.dirname()` of the root directory is the root directory
		if (nextDirPath === dirPath) return;
		dirPath = nextDirPath;
	}
}

function assertCompatibleVitestVersion(ctx: Vitest) {
	// Some package managers don't enforce `peerDependencies` requirements,
	// so add a runtime sanity check to ensure things don't break in strange ways.
	const poolPkgJson = getPackageJson(__dirname);
	const vitestPkgJson = getPackageJson(
		path.dirname(ctx.projectFiles.workerPath)
	);
	assert(
		poolPkgJson !== undefined,
		"Expected to find `package.json` for `@cloudflare/vitest-pool-workers`"
	);
	assert(
		vitestPkgJson !== undefined,
		"Expected to find `package.json` for `vitest`"
	);

	const expectedVitestVersion = poolPkgJson.peerDependencies?.vitest;
	const actualVitestVersion = vitestPkgJson.version;
	assert(
		expectedVitestVersion !== undefined,
		"Expected to find `@cloudflare/vitest-pool-workers`'s `vitest` version constraint"
	);
	assert(
		actualVitestVersion !== undefined,
		"Expected to find `vitest`'s version"
	);

	if (expectedVitestVersion !== actualVitestVersion) {
		const message = [
			`You're running \`vitest@${actualVitestVersion}\`, but this version of \`@cloudflare/vitest-pool-workers\` only supports \`vitest@${expectedVitestVersion}\`.`,
			"`@cloudflare/vitest-pool-workers` currently depends on internal Vitest APIs that are not protected by semantic-versioning guarantees.",
			`Please install \`vitest@${expectedVitestVersion}\` to continue using \`@cloudflare/vitest-pool-workers\`.`,
		].join("\n");
		throw new Error(message);
	}
}

export default function (ctx: Vitest): ProcessPool {
	assertCompatibleVitestVersion(ctx);

	return {
		name: "vitest-pool-workers",
		async runTests(specs, invalidates) {
			// Vitest waits for the previous `runTests()` to complete before calling
			// `runTests()` again:
			// https://github.com/vitest-dev/vitest/blob/v1.0.4/packages/vitest/src/node/core.ts#L458-L459
			// This behaviour is required for stacked storage to work correctly.
			// If we had concurrent runs, stack pushes/pops would interfere. We should
			// always have an empty, fully-popped stacked at the end of a run.

			// 1. Collect new specs
			const parsedProjectOptions = new Set<WorkspaceProject>();
			for (const [project, testFile] of specs) {
				// Vitest validates all project names are unique
				const projectName = project.getName();
				let workersProject = allProjects.get(projectName);
				// Parse project options once per project per re-run
				if (workersProject === undefined) {
					workersProject = {
						project,
						options: await parseProjectOptions(project),
						testFiles: new Set(),
						relativePath: getRelativeProjectPath(project.path),
					};
					allProjects.set(projectName, workersProject);
				} else if (!parsedProjectOptions.has(project)) {
					workersProject.project = project;
					workersProject.options = await parseProjectOptions(project);
					workersProject.relativePath = getRelativeProjectPath(project.path);
				}
				workersProject.testFiles.add(testFile);

				parsedProjectOptions.add(project);
			}

			// 2. Run just the required tests
			const resultPromises: Promise<void>[] = [];
			const filesByProject = groupBy(
				specs,
				([project]) => project,
				([, file]) => file
			);
			for (const [workspaceProject, files] of filesByProject) {
				const project = allProjects.get(workspaceProject.getName());
				assert(project !== undefined); // Defined earlier in this function
				const options = project.options;

				const config = workspaceProject.getSerializableConfig();

				// Use our custom test runner
				config.runner = "cloudflare:test-runner";

				// Make sure `setImmediate` and `clearImmediate` are never faked as they
				// don't exist on the workers global scope
				config.fakeTimers.toFake = config.fakeTimers.toFake?.filter(
					(method) => method !== "setImmediate" && method !== "clearImmediate"
				);

				// Make sure we have a deep-clone of `poolOptions` to mutate.
				// `getSerializableConfig()` may return references to the same objects,
				// and we don't want changes to `config.poolOptions.workers` to be
				// visible across projects.
				config.poolOptions = structuredClone(config.poolOptions) ?? {};

				// Allow workers to be re-used by removing the isolation requirement
				config.poolOptions.threads ??= {};
				config.poolOptions.threads.isolate = false;

				// Include resolved `main` if defined, and the names of Durable Object
				// bindings that point to classes in the current isolate in the
				// serialized config
				const main = maybeGetResolvedMainPath(project);
				const isolateDurableObjectBindings = Array.from(
					getDurableObjectBindingNamesToSelf(project.options)
				);
				config.poolOptions.workers = {
					main,
					isolateDurableObjectBindings,
					isolatedStorage: project.options.isolatedStorage,
				};

				const mf = await getProjectMiniflare(project);
				if (options.singleWorker) {
					// Single Worker, Isolated or Shared Storage
					//  --> single instance with single runner worker
					assert(mf instanceof Miniflare, "Expected single instance");
					const name = getRunnerName(workspaceProject);
					resultPromises.push(
						runTests(ctx, mf, name, project, config, files, invalidates)
					);
				} else if (options.isolatedStorage) {
					// Multiple Workers, Isolated Storage:
					//  --> multiple instances each with single runner worker
					assert(mf instanceof Map, "Expected multiple isolated instances");
					const name = getRunnerName(workspaceProject);
					for (const file of files) {
						const fileMf = mf.get(file);
						assert(fileMf !== undefined);
						resultPromises.push(
							runTests(ctx, fileMf, name, project, config, [file], invalidates)
						);
					}
				} else {
					// Multiple Workers, Shared Storage:
					//  --> single instance with multiple runner workers
					assert(mf instanceof Miniflare, "Expected single instance");
					for (const file of files) {
						const name = getRunnerName(workspaceProject, file);
						resultPromises.push(
							runTests(ctx, mf, name, project, config, [file], invalidates)
						);
					}
				}
			}

			// 3. Wait for all tests to complete, and throw if any failed
			const results = await Promise.allSettled(resultPromises);
			const errors = results
				.filter((r): r is PromiseRejectedResult => r.status === "rejected")
				.map((r) => r.reason);

			// 4. Clean up persistence directories. Note we do this in the background
			//    at the end of tests as opposed to before tests start, so re-runs
			//    start quickly, and results are displayed as soon as they're ready.
			for (const project of allProjects.values()) {
				if (project.mf !== undefined) {
					void forEachMiniflare(project.mf, async (mf) =>
						scheduleStorageReset(mf)
					);
				}
			}

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
		async close() {
			log.debug("Shutting down runtimes...");
			const promises: Promise<unknown>[] = [];
			for (const project of allProjects.values()) {
				if (project.mf !== undefined) {
					promises.push(forEachMiniflare(project.mf, (mf) => mf.dispose()));
				}
			}
			await Promise.all(promises);
		},
	};
}
