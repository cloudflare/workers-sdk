import assert from "node:assert";
import crypto from "node:crypto";
import events from "node:events";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import util from "node:util";
import { createBirpc } from "birpc";
import * as devalue from "devalue";
import getPort, { portNumbers } from "get-port";
import {
	compileModuleRules,
	getNodeCompat,
	kCurrentWorker,
	kUnsafeEphemeralUniqueKey,
	Log,
	LogLevel,
	maybeApply,
	Miniflare,
	structuredSerializableReducers,
	structuredSerializableRevivers,
	supportedCompatibilityDate,
	testRegExps,
	WebSocket,
} from "miniflare";
import semverSatisfies from "semver/functions/satisfies.js";
import { createMethodsRPC } from "vitest/node";
import { experimental_readRawConfig } from "wrangler";
import { workerdBuiltinModules } from "../shared/builtin-modules";
import { createChunkingSocket } from "../shared/chunking-socket";
import { CompatibilityFlagAssertions } from "./compatibility-flag-assertions";
import { OPTIONS_PATH, parseProjectOptions } from "./config";
import { guessWorkerExports } from "./guess-exports";
import {
	getProjectPath,
	getRelativeProjectPath,
	isFileNotFoundError,
	WORKER_NAME_PREFIX,
} from "./helpers";
import {
	ABORT_ALL_WORKER,
	handleLoopbackRequest,
	scheduleStorageReset,
	waitForStorageReset,
} from "./loopback";
import { handleModuleFallbackRequest } from "./module-fallback";
import type {
	SourcelessWorkerOptions,
	WorkersConfigPluginAPI,
	WorkersPoolOptions,
	WorkersPoolOptionsWithDefines,
} from "./config";
import type {
	CloseEvent,
	MiniflareOptions,
	SharedOptions,
	WorkerOptions,
} from "miniflare";
import type { Readable } from "node:stream";
import type { MessagePort } from "node:worker_threads";
import type {
	RunnerRPC,
	RuntimeRPC,
	SerializedConfig,
	WorkerContext,
} from "vitest";
import type {
	ProcessPool,
	TestSpecification,
	Vitest,
	WorkspaceProject,
} from "vitest/node";

interface SerializedOptions {
	main?: string;
	durableObjectBindingDesignators?: Map<
		string /* bound name */,
		DurableObjectDesignator
	>;
	isolatedStorage?: boolean;
}

// https://github.com/vitest-dev/vitest/blob/v2.1.1/packages/vite-node/src/client.ts#L468
declare const __vite_ssr_import__: unknown;
assert(
	typeof __vite_ssr_import__ === "undefined",
	"Expected `@cloudflare/vitest-pool-workers` not to be transformed by Vite"
);

function structuredSerializableStringify(value: unknown): string {
	// Vitest v2+ sends a sourcemap to it's runner, which we can't serialise currently
	// Deleting it doesn't seem to cause any problems, and error stack traces etc...
	// still seem to work
	// TODO: Figure out how to serialise SourceMap instances
	if (
		value &&
		typeof value === "object" &&
		"r" in value &&
		value.r &&
		typeof value.r === "object" &&
		"map" in value.r &&
		value.r.map
	) {
		delete value.r.map;
	}
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST_PATH = path.resolve(__dirname, "..");
const POOL_WORKER_PATH = path.join(DIST_PATH, "worker/index.mjs");

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
	if (mfs instanceof Miniflare) {
		return callback(mfs);
	}

	const promises: Promise<unknown>[] = [];
	for (const mf of mfs.values()) {
		promises.push(callback(mf));
	}
	return Promise.all(promises);
}

interface Project {
	project: WorkspaceProject;
	options: WorkersPoolOptionsWithDefines;
	testFiles: Set<string>;
	relativePath: string | number;
	mf?: SingleOrPerTestFileMiniflare;
	previousMfOptions?: MiniflareOptions;
}
const allProjects = new Map<string /* projectName */, Project>();

function getRunnerName(project: WorkspaceProject, testFile?: string) {
	const name = `${WORKER_NAME_PREFIX}runner-${project.getName().replace(/[^a-z0-9-]/gi, "_")}`;
	if (testFile === undefined) {
		return name;
	}
	const testFileHash = crypto.createHash("sha1").update(testFile).digest("hex");
	testFile = testFile.replace(/[^a-z0-9-]/gi, "_");
	return `${name}-${testFileHash}-${testFile}`;
}

function isDurableObjectDesignatorToSelf(
	value: unknown
): value is string | { className: string } {
	// Either this is a simple `string` designator to the current worker...
	if (typeof value === "string") {
		return true;
	}
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

function isWorkflowDesignatorToSelf(
	value: unknown,
	currentScriptName: string | undefined
): value is { className: string } {
	return (
		typeof value === "object" &&
		value !== null &&
		"className" in value &&
		typeof value.className === "string" &&
		(!("scriptName" in value) ||
			value.scriptName === undefined ||
			value.scriptName === currentScriptName)
	);
}

interface DurableObjectDesignator {
	className: string;
	scriptName?: string;
	unsafeUniqueKey?: string;
}
/**
 * Returns a map of Durable Objects bindings' bound names to the designators of
 * the objects they point to.
 */
function getDurableObjectDesignators(
	options: WorkersPoolOptions
): Map<string /* bound name */, DurableObjectDesignator> {
	const result = new Map<string, DurableObjectDesignator>();
	const durableObjects = options.miniflare?.durableObjects ?? {};
	for (const [key, designator] of Object.entries(durableObjects)) {
		if (typeof designator === "string") {
			result.set(key, { className: designator });
		} else if (typeof designator.unsafeUniqueKey !== "symbol") {
			result.set(key, {
				className: designator.className,
				scriptName: designator.scriptName,
				unsafeUniqueKey: designator.unsafeUniqueKey,
			});
		}
	}

	for (const unboundDurableObject of options.miniflare
		?.additionalUnboundDurableObjects ?? []) {
		if (typeof unboundDurableObject.unsafeUniqueKey !== "symbol") {
			result.set(unboundDurableObject.className, {
				className: unboundDurableObject.className,
				scriptName: unboundDurableObject.scriptName,
				unsafeUniqueKey: unboundDurableObject.unsafeUniqueKey,
			});
		}
	}
	return result;
}

const POOL_WORKER_DIR = path.dirname(POOL_WORKER_PATH);
const USER_OBJECT_MODULE_NAME = "__VITEST_POOL_WORKERS_USER_OBJECT";
const USER_OBJECT_MODULE_PATH = path.join(
	POOL_WORKER_DIR,
	USER_OBJECT_MODULE_NAME
);
const DEFINES_MODULE_PATH = path.join(
	POOL_WORKER_DIR,
	"__VITEST_POOL_WORKERS_DEFINES"
);

/**
 * Gets a set of Durable Object class names for the SELF Worker.
 *
 * This is calculated from the Durable Object bindings that point to SELF as well as the
 * unbound Durable Objects that only have migrations defined.
 */
function getDurableObjectClasses(worker: SourcelessWorkerOptions): Set<string> {
	// TODO(someday): may need to extend this to take into account other workers
	//  if doing multi-worker tests across workspace projects
	// TODO(someday): may want to validate class names are valid identifiers?
	const result = new Set<string>();

	// Get all the Durable Object class names from bindings to the SELF Worker.
	for (const designator of Object.values(worker.durableObjects ?? {})) {
		if (isDurableObjectDesignatorToSelf(designator)) {
			result.add(
				typeof designator === "string" ? designator : designator.className
			);
		}
	}

	// And all the Durable Object class names that may not have bindings but have migrations.
	for (const designator of worker.additionalUnboundDurableObjects ?? []) {
		result.add(designator.className);
	}

	return result;
}

function getWranglerWorkerName(
	relativeWranglerConfigPath?: string
): string | undefined {
	if (!relativeWranglerConfigPath) {
		return undefined;
	}
	const wranglerConfigObject = experimental_readRawConfig({
		config: relativeWranglerConfigPath,
	});
	return wranglerConfigObject.rawConfig.name;
}

function updateWorkflowsScriptNames(
	runnerWorker: WorkerOptions,
	wranglerWorkerName: string | undefined
): void {
	const workflows = runnerWorker.workflows;
	if (!workflows || wranglerWorkerName === undefined) {
		return;
	}
	for (const workflow of Object.values(workflows)) {
		if (workflow.scriptName === wranglerWorkerName) {
			delete workflow.scriptName;
		}
	}
}

/**
 * Gets a set of class names for Workflows defined in the SELF Worker.
 */
function getWorkflowClasses(
	worker: SourcelessWorkerOptions,
	relativeWranglerConfigPath: string | undefined
): Set<string> {
	// TODO(someday): may need to extend this to take into account other workers
	//  if doing multi-worker tests across workspace projects
	// TODO(someday): may want to validate class names are valid identifiers?
	const result = new Set<string>();
	if (worker.workflows === undefined) {
		return result;
	}
	for (const key of Object.keys(worker.workflows)) {
		const designator = worker.workflows[key];

		let workerName: string | undefined;
		// If the designator's scriptName matches its own Worker name,
		// use that as the worker name, otherwise use the vitest worker's name
		const wranglerWorkerName = getWranglerWorkerName(
			relativeWranglerConfigPath
		);
		if (wranglerWorkerName && designator.scriptName === wranglerWorkerName) {
			workerName = wranglerWorkerName;
		} else {
			workerName = worker.name;
		}

		// `designator` hasn't been validated at this point
		if (isWorkflowDesignatorToSelf(designator, workerName)) {
			result.add(designator.className);
			// Shallow clone to avoid mutating config
			worker.workflows[key] = { ...designator };
		}
	}
	return result;
}

type ProjectWorkers = [
	runnerWorker: WorkerOptions,
	...auxiliaryWorkers: WorkerOptions[],
];

const SELF_NAME_BINDING = "__VITEST_POOL_WORKERS_SELF_NAME";
const SELF_SERVICE_BINDING = "__VITEST_POOL_WORKERS_SELF_SERVICE";
const LOOPBACK_SERVICE_BINDING = "__VITEST_POOL_WORKERS_LOOPBACK_SERVICE";
const RUNNER_OBJECT_BINDING = "__VITEST_POOL_WORKERS_RUNNER_OBJECT";

async function buildProjectWorkerOptions(
	project: Omit<Project, "testFiles">
): Promise<ProjectWorkers> {
	const relativeWranglerConfigPath = maybeApply(
		(v) => path.relative("", v),
		project.options.wrangler?.configPath
	);
	const runnerWorker = project.options.miniflare ?? {};

	// Make sure the worker has a well-known name, and share it with the runner
	runnerWorker.name = getRunnerName(project.project);
	runnerWorker.bindings ??= {};
	runnerWorker.bindings[SELF_NAME_BINDING] = runnerWorker.name;

	// Make sure the worker has the `nodejs_compat` and `export_commonjs_default`
	// compatibility flags enabled. Vitest makes heavy use of Node APIs, and many
	// of the libraries it depends on expect `require()` to return
	// `module.exports` directly, rather than `{ default: module.exports }`.
	runnerWorker.compatibilityFlags ??= [];

	if (runnerWorker.compatibilityDate === undefined) {
		// No compatibility date was provided, so infer the latest supported date
		runnerWorker.compatibilityDate ??= supportedCompatibilityDate;
		log.info(
			`No compatibility date was provided for project ${project.relativePath}, defaulting to latest supported date ${runnerWorker.compatibilityDate}.`
		);
	}

	const flagAssertions = new CompatibilityFlagAssertions({
		compatibilityDate: runnerWorker.compatibilityDate,
		compatibilityFlags: runnerWorker.compatibilityFlags,
		optionsPath: `${OPTIONS_PATH}.miniflare`,
		relativeProjectPath: project.relativePath.toString(),
		relativeWranglerConfigPath,
	});

	const assertions = [
		() =>
			flagAssertions.assertIsEnabled({
				enableFlag: "export_commonjs_default",
				disableFlag: "export_commonjs_namespace",
				defaultOnDate: "2022-10-31",
			}),
	];

	for (const assertion of assertions) {
		const result = assertion();
		if (!result.isValid) {
			throw new Error(result.errorMessage);
		}
	}

	const { hasNoNodejsCompatV2Flag, mode } = getNodeCompat(
		runnerWorker.compatibilityDate,
		runnerWorker.compatibilityFlags
	);

	// Force nodejs_compat_v2 flag, even if it is disabled by the user, since we require this native stuff for Vitest to work properly
	if (mode !== "v2") {
		if (hasNoNodejsCompatV2Flag) {
			runnerWorker.compatibilityFlags.splice(
				runnerWorker.compatibilityFlags.indexOf("no_nodejs_compat_v2"),
				1
			);
		}
		runnerWorker.compatibilityFlags.push("nodejs_compat_v2");
	}

	// Required for `workerd:unsafe` module. We don't require this flag to be set
	// as it's experimental, so couldn't be deployed by users.
	if (!runnerWorker.compatibilityFlags.includes("unsafe_module")) {
		runnerWorker.compatibilityFlags.push("unsafe_module");
	}

	// The following nodejs compat flags enable features required for Vitest to work properly
	ensureFeature(runnerWorker.compatibilityFlags, "nodejs_tty_module");
	ensureFeature(runnerWorker.compatibilityFlags, "nodejs_fs_module");
	ensureFeature(runnerWorker.compatibilityFlags, "nodejs_http_modules");
	ensureFeature(runnerWorker.compatibilityFlags, "nodejs_perf_hooks_module");

	// Make sure we define an unsafe eval binding and enable the fallback service
	runnerWorker.unsafeEvalBinding = "__VITEST_POOL_WORKERS_UNSAFE_EVAL";
	runnerWorker.unsafeUseModuleFallbackService = true;

	// Make sure we define our self/loopback service bindings for helpers
	runnerWorker.serviceBindings ??= {};
	runnerWorker.serviceBindings[SELF_SERVICE_BINDING] = kCurrentWorker;
	runnerWorker.serviceBindings[LOOPBACK_SERVICE_BINDING] =
		handleLoopbackRequest;

	// Build wrappers for entrypoints and Durable Objects defined in this worker
	runnerWorker.durableObjects ??= {};
	const durableObjectClassNames = getDurableObjectClasses(runnerWorker);

	const workflowClassNames = getWorkflowClasses(
		runnerWorker,
		relativeWranglerConfigPath
	);

	const selfWorkerExports: string[] = [];
	if (
		flagAssertions.isEnabled(
			"enable_ctx_exports",
			"disable_ctx_exports",
			"2025-11-17"
		)
	) {
		try {
			const resolvedMain = maybeGetResolvedMainPath(project);
			const guessedExports = await guessWorkerExports(
				resolvedMain,
				project.options.additionalExports
			);
			for (const [exportName, exportType] of guessedExports) {
				switch (exportType) {
					case "DurableObject":
						durableObjectClassNames.add(exportName);
						break;
					case "WorkflowEntrypoint":
						workflowClassNames.add(exportName);
						break;
					case "WorkerEntrypoint":
					case null:
						selfWorkerExports.push(exportName);
				}
			}
		} catch (e) {
			const message = `Failed to statically analyze the exports of the main Worker entry-point "${project.options.main}"\nMore details: ${e}`;
			for (const line of message.split("\n")) {
				log.warn(line);
			}
		}
	}

	const workerEntrypointExports = selfWorkerExports.filter(
		(name) =>
			name !== "default" &&
			name !== "__esModule" &&
			!durableObjectClassNames.has(name) &&
			!workflowClassNames.has(name)
	);

	const wrappers = [
		'import { createWorkerEntrypointWrapper, createDurableObjectWrapper, createWorkflowEntrypointWrapper } from "cloudflare:test-internal";',
	];

	for (const entrypointName of workerEntrypointExports.sort()) {
		const quotedEntrypointName = JSON.stringify(entrypointName);
		const wrapper = `export const ${entrypointName} = createWorkerEntrypointWrapper(${quotedEntrypointName});`;
		wrappers.push(wrapper);
	}
	for (const className of Array.from(durableObjectClassNames).sort()) {
		const quotedClassName = JSON.stringify(className);
		const wrapper = `export const ${className} = createDurableObjectWrapper(${quotedClassName});`;
		wrappers.push(wrapper);
	}

	for (const className of Array.from(workflowClassNames).sort()) {
		const quotedClassName = JSON.stringify(className);
		const wrapper = `export const ${className} = createWorkflowEntrypointWrapper(${quotedClassName});`;
		wrappers.push(wrapper);
	}

	// Make sure we define the `__VITEST_POOL_WORKERS_RUNNER_DURABLE_OBJECT__` Durable Object,
	// which is the singleton host for running tests.
	runnerWorker.durableObjects[RUNNER_OBJECT_BINDING] = {
		className: "__VITEST_POOL_WORKERS_RUNNER_DURABLE_OBJECT__",
		// Make the runner object ephemeral, so it doesn't write any `.sqlite` files
		// that would disrupt stacked storage because we prevent eviction
		unsafeUniqueKey: kUnsafeEphemeralUniqueKey,
		unsafePreventEviction: true,
	};

	// Vite has its own define mechanism, but we can't control it from custom
	// pools. Our defines come from `wrangler.toml` files which are only parsed
	// with the rest of the pool configuration. Instead, we implement our own
	// define script similar to Vite's. When defines change, Miniflare will be
	// restarted as the input options will be different.
	const defines = `export default {
		${Object.entries(project.options.defines ?? {})
			.map(([key, value]) => `${JSON.stringify(key)}: ${value}`)
			.join(",\n")}
	};
	`;

	// Make sure we define the runner script, including object wrappers & defines
	if ("script" in runnerWorker) {
		delete runnerWorker.script;
	}
	if ("scriptPath" in runnerWorker) {
		delete runnerWorker.scriptPath;
	}

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
			contents: wrappers.join("\n"),
		},
		{
			type: "ESModule",
			path: path.join(modulesRoot, DEFINES_MODULE_PATH),
			contents: defines,
		},
		// The native workerd provided nodejs modules don't always support everything Vitest needs.
		// As a short-term fix, inject polyfills into the worker bundle that override the native modules.
		{
			type: "ESModule",
			path: path.join(modulesRoot, "node:console"),
			contents: fs.readFileSync(
				path.join(DIST_PATH, `worker/node/console.mjs`)
			),
		},
		{
			type: "ESModule",
			path: path.join(modulesRoot, "node:vm"),
			contents: fs.readFileSync(path.join(DIST_PATH, `worker/node/vm.mjs`)),
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
					`In project ${project.relativePath}, \`${OPTIONS_PATH}.miniflare.workers[${i}].name\` must be non-empty`
				);
			}
			// ...that doesn't start with our reserved prefix
			if (worker.name.startsWith(WORKER_NAME_PREFIX)) {
				throw new Error(
					`In project ${project.relativePath}, \`${OPTIONS_PATH}.miniflare.workers[${i}].name\` must not start with "${WORKER_NAME_PREFIX}", got ${worker.name}`
				);
			}

			// Miniflare will validate these options
			workers.push(worker as WorkerOptions);
		}
		delete runnerWorker.workers;
	}

	return workers;
}

const SHARED_MINIFLARE_OPTIONS: SharedOptions = {
	log: mfLog,
	verbose: true,
	handleRuntimeStdio,
	unsafeStickyBlobs: true,
} satisfies Partial<MiniflareOptions>;

const DEFAULT_INSPECTOR_PORT = 9229;

function getFirstAvailablePort(start: number): Promise<number> {
	return getPort({ port: portNumbers(start, 65535) });
}

type ModuleFallbackService = NonNullable<
	MiniflareOptions["unsafeModuleFallbackService"]
>;
// Reuse the same bound module fallback service when constructing Miniflare
// options, so deep equality checks succeed
const moduleFallbackServices = new WeakMap<Vitest, ModuleFallbackService>();
function getModuleFallbackService(ctx: Vitest): ModuleFallbackService {
	let service = moduleFallbackServices.get(ctx);
	if (service !== undefined) {
		return service;
	}
	// @ts-expect-error ctx.vitenode is marked as internal
	service = handleModuleFallbackRequest.bind(undefined, ctx.vitenode.server);
	moduleFallbackServices.set(ctx, service);
	return service;
}

/**
 * Builds options for the Miniflare instance running tests for the given Vitest
 * project. The first `runnerWorker` returned may be duplicated in the instance
 * if `singleWorker` is disabled so tests can execute in-parallel and isolation.
 */
async function buildProjectMiniflareOptions(
	ctx: Vitest,
	project: Project
): Promise<MiniflareOptions> {
	const moduleFallbackService = getModuleFallbackService(ctx);
	const [runnerWorker, ...auxiliaryWorkers] =
		await buildProjectWorkerOptions(project);

	assert(runnerWorker.name !== undefined);
	assert(runnerWorker.name.startsWith(WORKER_NAME_PREFIX));

	let inspectorPort: number | undefined;
	if (ctx.config.inspector.enabled) {
		const userSpecifiedPort = ctx.config.inspector.port;
		if (userSpecifiedPort !== undefined) {
			const availablePort = await getFirstAvailablePort(userSpecifiedPort);
			if (availablePort !== userSpecifiedPort) {
				throw new Error(
					`Inspector port ${userSpecifiedPort} is not available. ` +
						`Either free up the port or remove the inspector port configuration to use an automatically assigned port.`
				);
			}
			inspectorPort = userSpecifiedPort;
		} else {
			inspectorPort = await getFirstAvailablePort(DEFAULT_INSPECTOR_PORT);
			if (inspectorPort !== DEFAULT_INSPECTOR_PORT) {
				log.warn(
					`Default inspector port ${DEFAULT_INSPECTOR_PORT} not available, using ${inspectorPort} instead.`
				);
			}
		}
	}

	if (inspectorPort !== undefined && !project.options.singleWorker) {
		log.warn(`Tests run in singleWorker mode when the inspector is open.`);

		project.options.singleWorker = true;
	}

	if (project.options.singleWorker || project.options.isolatedStorage) {
		// Single Worker, Isolated or Shared Storage
		//  --> single instance with single runner worker
		// Multiple Workers, Isolated Storage:
		//  --> multiple instances each with single runner worker

		// Set Workflows scriptName to the runner worker name if it matches the Wrangler worker name
		const wranglerWorkerName = getWranglerWorkerName(
			project.options.wrangler?.configPath
		);
		updateWorkflowsScriptNames(runnerWorker, wranglerWorkerName);

		return {
			...SHARED_MINIFLARE_OPTIONS,
			inspectorPort,
			unsafeModuleFallbackService: moduleFallbackService,
			workers: [runnerWorker, ABORT_ALL_WORKER, ...auxiliaryWorkers],
		};
	} else {
		// Multiple Workers, Shared Storage:
		//  --> single instance with multiple runner workers
		const testWorkers: WorkerOptions[] = [];
		for (const testFile of project.testFiles) {
			const testWorker = { ...runnerWorker };
			testWorker.name = getRunnerName(project.project, testFile);

			// Update binding to own name
			assert(testWorker.bindings !== undefined);
			testWorker.bindings = { ...testWorker.bindings };
			testWorker.bindings[SELF_NAME_BINDING] = testWorker.name;

			// Set Workflows scriptName to the test worker name if it matches the Wrangler worker name
			const wranglerWorkerName = getWranglerWorkerName(
				project.options.wrangler?.configPath
			);
			updateWorkflowsScriptNames(testWorker, wranglerWorkerName);

			testWorkers.push(testWorker);
		}
		return {
			...SHARED_MINIFLARE_OPTIONS,
			unsafeModuleFallbackService: moduleFallbackService,
			workers: [...testWorkers, ABORT_ALL_WORKER, ...auxiliaryWorkers],
		};
	}
}
async function getProjectMiniflare(
	ctx: Vitest,
	project: Project
): Promise<SingleOrPerTestFileMiniflare> {
	const mfOptions = await buildProjectMiniflareOptions(ctx, project);
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
			log.info(
				`Starting single runtime for ${project.relativePath}` +
					`${mfOptions.inspectorPort !== undefined ? ` with inspector on port ${mfOptions.inspectorPort}` : ""}` +
					`...`
			);
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

function maybeGetResolvedMainPath(
	project: Omit<Project, "testFiles">
): string | undefined {
	const projectPath = getProjectPath(project.project);
	const main = project.options.main;
	if (main === undefined) {
		return;
	}
	if (typeof projectPath === "string") {
		return path.resolve(path.dirname(projectPath), main);
	} else {
		return path.resolve(main);
	}
}

async function runTests(
	ctx: Vitest,
	mf: Miniflare,
	workerName: string,
	project: Project,
	config: SerializedConfig,
	files: string[],
	invalidates: string[] = [],
	method: "run" | "collect"
) {
	const workerPath = path.join(ctx.distPath, "worker.js");
	const threadsWorkerPath = path.join(ctx.distPath, "workers", "threads.js");

	ctx.state.clearFiles(project.project, files);
	const data: WorkerContext = {
		pool: "threads",
		worker: pathToFileURL(threadsWorkerPath).href,
		port: undefined as unknown as MessagePort,
		config,
		files,
		invalidates,
		environment: { name: "node", options: null },
		workerId: 0,
		projectName: project.project.getName(),
		providedContext: project.project.getProvidedContext(),
	};

	// Find the vitest-pool-workers:config plugin and give it the path to the main file.
	// This allows that plugin to inject a virtual dependency on main so that vitest
	// will automatically re-run tests when that gets updated, avoiding the user having
	// to manually add such an import in their tests.
	const configPlugin = project.project.server.config.plugins.find(
		({ name }) => name === "@cloudflare/vitest-pool-workers:config"
	);
	if (configPlugin !== undefined) {
		const api = configPlugin.api as WorkersConfigPluginAPI;
		api.setMain(project.options.main);
	}

	// We reset storage at the end of tests when the user is presumably looking at
	// results. We don't need to reset storage on the first run as instances were
	// just created.
	await waitForStorageReset(mf);
	const ns = await mf.getDurableObjectNamespace(
		RUNNER_OBJECT_BINDING,
		workerName
	);
	// @ts-expect-error `ColoLocalActorNamespace`s are not included in types
	const stub = ns.get("singleton");

	const res = await stub.fetch("http://placeholder", {
		headers: {
			Upgrade: "websocket",
			"MF-Vitest-Worker-Data": structuredSerializableStringify({
				filePath: pathToFileURL(workerPath).href,
				name: method,
				data,
				cwd: process.cwd(),
			}),
		},
	});
	const webSocket = res.webSocket;
	assert(webSocket !== null);

	const chunkingSocket = createChunkingSocket({
		post(message) {
			webSocket.send(message);
		},
		on(listener) {
			webSocket.addEventListener("message", (event) => {
				listener(event.data);
			});
		},
	});

	// Compile module rules for matching against
	const rules = project.options.miniflare?.modulesRules;
	const compiledRules = compileModuleRules(rules ?? []);

	const localRpcFunctions = createMethodsRPC(project.project, {
		cacheFs: false,
	});
	const patchedLocalRpcFunctions: RuntimeRPC = {
		...localRpcFunctions,
		async fetch(...args) {
			const specifier = args[0];

			// Mark built-in modules (e.g. `cloudflare:test-runner`) as external.
			// Note we explicitly don't mark `cloudflare:test` as external here, as
			// this is handled by a Vite plugin injected by `defineWorkersConfig()`.
			// The virtual `cloudflare:test` module will define a dependency on the
			// specific `main` entrypoint, ensuring tests reload when it changes.
			// Note Vite's module graph is constructed using static analysis, so the
			// dynamic import of `main` won't add an imported-by edge to the graph.
			if (
				specifier !== "cloudflare:test" &&
				(/^(cloudflare|workerd):/.test(specifier) ||
					workerdBuiltinModules.has(specifier))
			) {
				return { externalize: specifier };
			}

			// If the specifier matches any module rules, force it to be loaded as
			// that type. This will be handled by the module fallback service.
			const maybeRule = compiledRules.find((rule) =>
				testRegExps(rule.include, specifier)
			);

			// Skip if specifier already has query params (e.g. `?raw`), letting Vite handle it.
			if (maybeRule !== undefined && !specifier.includes("?")) {
				const externalize = specifier + `?mf_vitest_force=${maybeRule.type}`;
				return { externalize };
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
				chunkingSocket.post(structuredSerializableStringify(value));
			} else {
				debuglog("POOL--*      ", value);
			}
		},
		on(listener) {
			chunkingSocket.on((message) => {
				const value = structuredSerializableParse(message);
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

interface PackageJson {
	version?: string;
	peerDependencies?: Record<string, string | undefined>;
}
function getPackageJson(dirPath: string): PackageJson | undefined {
	while (true) {
		const pkgJsonPath = path.join(dirPath, "package.json");
		try {
			const contents = fs.readFileSync(pkgJsonPath, "utf8");
			return JSON.parse(contents);
		} catch (e) {
			if (!isFileNotFoundError(e)) {
				throw e;
			}
		}
		const nextDirPath = path.dirname(dirPath);
		// `path.dirname()` of the root directory is the root directory
		if (nextDirPath === dirPath) {
			return;
		}
		dirPath = nextDirPath;
	}
}

function assertCompatibleVitestVersion(ctx: Vitest) {
	// Some package managers don't enforce `peerDependencies` requirements,
	// so add a runtime sanity check to ensure things don't break in strange ways.
	const poolPkgJson = getPackageJson(__dirname);
	const vitestPkgJson = getPackageJson(ctx.distPath);
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

	if (!semverSatisfies(actualVitestVersion, expectedVitestVersion)) {
		const message = [
			`You're running \`vitest@${actualVitestVersion}\`, but this version of \`@cloudflare/vitest-pool-workers\` only officially supports \`vitest ${expectedVitestVersion}\`.`,
			"`@cloudflare/vitest-pool-workers` currently depends on internal Vitest APIs that are not protected by semantic-versioning guarantees.",
			`Your tests may work without issue, but we can not guarantee compatibility outside of the above version range.`,
		].join("\n");
		log.warn(message);
	}
}

let warnedUnsupportedInspectorOptions = false;

function validateInspectorConfig(config: SerializedConfig) {
	if (config.inspector.host) {
		throw new TypeError(
			"Customizing inspector host is not supported with vitest-pool-workers."
		);
	}

	if (config.inspector.enabled && !warnedUnsupportedInspectorOptions) {
		if (config.inspectBrk) {
			log.warn(
				`The "--inspect-brk" flag is not supported. Use "--inspect" instead.`
			);
		} else if (config.inspector.waitForDebugger) {
			log.warn(
				`The "inspector.waitForDebugger" option is not supported. Insert a debugger statement if you need to pause execution.`
			);
		}

		warnedUnsupportedInspectorOptions = true;
	}
}

async function executeMethod(
	ctx: Vitest,
	specs: TestSpecification[],
	invalidates: string[] | undefined,
	method: "run" | "collect"
) {
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
				relativePath: getRelativeProjectPath(project),
			};
			allProjects.set(projectName, workersProject);
		} else if (!parsedProjectOptions.has(project)) {
			workersProject.project = project;
			workersProject.options = await parseProjectOptions(project);
			workersProject.relativePath = getRelativeProjectPath(project);
		}
		workersProject.testFiles.add(testFile);

		parsedProjectOptions.add(project);
	}

	// 2. Run just the required tests
	const resultPromises: Promise<void>[] = [];
	const filesByProject = new Map<WorkspaceProject, string[]>();
	for (const [project, file] of specs) {
		let group = filesByProject.get(project);
		if (group === undefined) {
			filesByProject.set(project, (group = []));
		}
		group.push(file);
	}
	for (const [workspaceProject, files] of filesByProject) {
		const project = allProjects.get(workspaceProject.getName());
		assert(project !== undefined); // Defined earlier in this function
		const options = project.options;

		const config = workspaceProject.getSerializableConfig();

		// Use our custom test runner. We don't currently support custom
		// runners, since we need our own for isolated storage/fetch mock resets
		// to work properly. There aren't many use cases where a user would need
		// to control this.
		config.runner = "cloudflare:test-runner";

		// Make sure `setImmediate` and `clearImmediate` are never faked as they
		// don't exist on the workers global scope
		config.fakeTimers.toFake = config.fakeTimers.toFake?.filter(
			(timerMethod) =>
				timerMethod !== "setImmediate" && timerMethod !== "clearImmediate"
		);

		validateInspectorConfig(config);

		// We don't want it to call `node:inspector` inside Workerd
		config.inspector = {
			enabled: false,
		};

		// We don't need all pool options from the config at runtime.
		// Additionally, users may set symbols in the config which aren't
		// serialisable. `getSerializableConfig()` may also return references to
		// the same objects, so override it with a new object.
		config.poolOptions = {
			// @ts-expect-error Vitest provides no way to extend this type
			threads: {
				// Allow workers to be re-used by removing the isolation requirement
				isolate: false,
			},
			workers: {
				// Include resolved `main` if defined, and the names of Durable Object
				// bindings that point to classes in the current isolate in the
				// serialized config
				main: maybeGetResolvedMainPath(project),
				// Include designators of all Durable Object namespaces bound in the
				// runner worker. We'll use this to list IDs in a namespace. We'll
				// also use this to check Durable Object test runner helpers are
				// only used with classes defined in the current worker, as these
				// helpers rely on wrapping the object.
				durableObjectBindingDesignators: getDurableObjectDesignators(
					project.options
				),
				// Include whether isolated storage has been enabled for this
				// project, so we know whether to call out to the loopback service
				// to push/pop the storage stack between tests.
				isolatedStorage: project.options.isolatedStorage,
			} satisfies SerializedOptions,
		};

		const mf = await getProjectMiniflare(ctx, project);
		if (options.singleWorker) {
			// Single Worker, Isolated or Shared Storage
			//  --> single instance with single runner worker
			assert(mf instanceof Miniflare, "Expected single instance");
			const name = getRunnerName(workspaceProject);
			resultPromises.push(
				runTests(ctx, mf, name, project, config, files, invalidates, method)
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
					runTests(
						ctx,
						fileMf,
						name,
						project,
						config,
						[file],
						invalidates,
						method
					)
				);
			}
		} else {
			// Multiple Workers, Shared Storage:
			//  --> single instance with multiple runner workers
			assert(mf instanceof Miniflare, "Expected single instance");
			for (const file of files) {
				const name = getRunnerName(workspaceProject, file);
				resultPromises.push(
					runTests(ctx, mf, name, project, config, [file], invalidates, method)
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
			void forEachMiniflare(project.mf, async (mf) => scheduleStorageReset(mf));
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
}
export default function (ctx: Vitest): ProcessPool {
	// This function is called when config changes and may be called on re-runs
	assertCompatibleVitestVersion(ctx);

	return {
		name: "vitest-pool-workers",
		async runTests(specs, invalidates) {
			await executeMethod(ctx, specs, invalidates, "run");
		},
		async collectTests(specs, invalidates) {
			await executeMethod(ctx, specs, invalidates, "collect");
		},
		async close() {
			// `close()` will be called when shutting down Vitest or updating config
			log.debug("Shutting down runtimes...");
			const promises: Promise<unknown>[] = [];
			for (const project of allProjects.values()) {
				if (project.mf !== undefined) {
					promises.push(
						forEachMiniflare(project.mf, async (mf) => {
							// Finish in-progress storage resets before disposing
							await waitForStorageReset(mf);
							await mf.dispose();
						})
					);
				}
			}
			allProjects.clear();
			await Promise.all(promises);
		},
	};
}

/**
 * Ensures that the specified compatibility feature is enabled for Vitest to work.
 * @param compatibilityFlags The list of current compatibility flags.
 * @param feature The name of the feature to enable.
 */
function ensureFeature(compatibilityFlags: string[], feature: string) {
	const flagToEnable = `enable_${feature}`;
	const flagToDisable = `disable_${feature}`;
	if (!compatibilityFlags.includes(flagToEnable)) {
		log.debug(
			`Adding \`${flagToEnable}\` compatibility flag during tests as this feature is needed to support the Vitest runner.`
		);
		compatibilityFlags.push(flagToEnable);
	}
	if (compatibilityFlags.includes(flagToDisable)) {
		log.info(
			`Removing \`${flagToDisable}\` compatibility flag during tests as that feature is needed to support the Vitest runner.`
		);
		compatibilityFlags.splice(compatibilityFlags.indexOf(flagToDisable), 1);
	}
}
