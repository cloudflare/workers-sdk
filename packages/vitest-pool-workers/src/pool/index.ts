import assert from "node:assert";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as devalue from "devalue";
import getPort, { portNumbers } from "get-port";
import {
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
} from "miniflare";
import semverSatisfies from "semver/functions/satisfies.js";
import { experimental_readRawConfig } from "wrangler";
import { CompatibilityFlagAssertions } from "./compatibility-flag-assertions";
import { guessWorkerExports } from "./guess-exports";
import {
	getProjectPath,
	getRelativeProjectPath,
	isFileNotFoundError,
	WORKER_NAME_PREFIX,
} from "./helpers";
import { handleLoopbackRequest } from "./loopback";
import { handleModuleFallbackRequest } from "./module-fallback";
import type {
	SourcelessWorkerOptions,
	WorkersPoolOptions,
	WorkersPoolOptionsWithDefines,
} from "./config";
import type { MiniflareOptions, SharedOptions, WorkerOptions } from "miniflare";
import type { Readable } from "node:stream";
import type { TestProject, Vitest } from "vitest/node";

export function structuredSerializableStringify(value: unknown): string {
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

export function structuredSerializableParse(value: string): unknown {
	return devalue.parse(value, structuredSerializableRevivers);
}

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

export function getRunnerName(project: TestProject, testFile?: string) {
	const name = `${WORKER_NAME_PREFIX}runner-${project.name.replace(/[^a-z0-9-]/gi, "_")}`;
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
export function getDurableObjectDesignators(
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

const SELF_SERVICE_BINDING = "__VITEST_POOL_WORKERS_SELF_SERVICE";
const LOOPBACK_SERVICE_BINDING = "__VITEST_POOL_WORKERS_LOOPBACK_SERVICE";
const RUNNER_OBJECT_BINDING = "__VITEST_POOL_WORKERS_RUNNER_OBJECT";

async function buildProjectWorkerOptions(
	project: TestProject,
	customOptions: WorkersPoolOptionsWithDefines,
	main: string | undefined
): Promise<ProjectWorkers> {
	const relativeWranglerConfigPath = maybeApply(
		(v) => path.relative("", v),
		customOptions.wrangler?.configPath
	);
	const runnerWorker = customOptions.miniflare ?? {};

	runnerWorker.name = getRunnerName(project);

	// Make sure the worker has the `nodejs_compat` and `export_commonjs_default`
	// compatibility flags enabled. Vitest makes heavy use of Node APIs, and many
	// of the libraries it depends on expect `require()` to return
	// `module.exports` directly, rather than `{ default: module.exports }`.
	runnerWorker.compatibilityFlags ??= [];

	runnerWorker.compatibilityFlags.push(
		"no_handle_cross_request_promise_resolution"
	);

	if (runnerWorker.compatibilityDate === undefined) {
		// No compatibility date was provided, so infer the latest supported date
		runnerWorker.compatibilityDate ??= supportedCompatibilityDate;
		log.info(
			`No compatibility date was provided for project ${getRelativeProjectPath(project)}, defaulting to latest supported date ${runnerWorker.compatibilityDate}.`
		);
	}

	const flagAssertions = new CompatibilityFlagAssertions({
		compatibilityDate: runnerWorker.compatibilityDate,
		compatibilityFlags: runnerWorker.compatibilityFlags,
		optionsPath: `miniflare`,
		relativeProjectPath: getRelativeProjectPath(project),
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
			const guessedExports = await guessWorkerExports(
				main,
				customOptions.additionalExports
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
			const message = `Failed to statically analyze the exports of the main Worker entry-point "${customOptions.main}"\nMore details: ${e}`;
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
	// which is the singleton host for running tests. It's ephemeral because the
	// runner doesn't need persistent state, and disk-backed DOs hit a workerd bug
	// on Windows (sqlite.c++ uses Unix-style paths with the win32 SQLite VFS).
	runnerWorker.durableObjects[RUNNER_OBJECT_BINDING] = {
		className: "__VITEST_POOL_WORKERS_RUNNER_DURABLE_OBJECT__",
		unsafePreventEviction: true,
		unsafeUniqueKey: kUnsafeEphemeralUniqueKey,
	};

	// Vite has its own define mechanism, but we can't control it from custom
	// pools. Our defines come from `wrangler.toml` files which are only parsed
	// with the rest of the pool configuration. Instead, we implement our own
	// define script similar to Vite's. When defines change, Miniflare will be
	// restarted as the input options will be different.
	const defines = `export default {
		${Object.entries(customOptions.defines ?? {})
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
			path: path.join(modulesRoot, "index.mjs"),
			contents: fs.readFileSync(POOL_WORKER_PATH),
		},
		{
			type: "ESModule",
			path: path.join(modulesRoot, "__VITEST_POOL_WORKERS_USER_OBJECT"),
			contents: wrappers.join("\n"),
		},
		{
			type: "ESModule",
			path: path.join(modulesRoot, "__VITEST_POOL_WORKERS_DEFINES"),
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
		{
			type: "ESModule",
			path: path.join(modulesRoot, "node:v8"),
			contents: fs.readFileSync(path.join(DIST_PATH, `worker/node/v8.mjs`)),
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
					`In project ${getRelativeProjectPath(project)}, \`miniflare.workers[${i}].name\` must be non-empty`
				);
			}
			// ...that doesn't start with our reserved prefix
			if (worker.name.startsWith(WORKER_NAME_PREFIX)) {
				throw new Error(
					`In project ${getRelativeProjectPath(project)}, \`miniflare.workers[${i}].name\` must not start with "${WORKER_NAME_PREFIX}", got ${worker.name}`
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
	service = handleModuleFallbackRequest.bind(undefined, ctx.vite);
	moduleFallbackServices.set(ctx, service);
	return service;
}

/**
 * Builds options for the Miniflare instance running tests for the given Vitest
 * project.
 */
async function buildProjectMiniflareOptions(
	ctx: Vitest,
	project: TestProject,
	customOptions: WorkersPoolOptions,
	main: string | undefined
): Promise<MiniflareOptions> {
	const moduleFallbackService = getModuleFallbackService(ctx);
	const [runnerWorker, ...auxiliaryWorkers] = await buildProjectWorkerOptions(
		project,
		customOptions,
		main
	);

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

	return {
		...SHARED_MINIFLARE_OPTIONS,
		inspectorPort,
		unsafeModuleFallbackService: moduleFallbackService,
		workers: [runnerWorker, ...auxiliaryWorkers],
	};
}
export async function getProjectMiniflare(
	ctx: Vitest,
	project: TestProject,
	poolOptions: WorkersPoolOptionsWithDefines,
	main: string | undefined
): Promise<Miniflare> {
	const mfOptions = await buildProjectMiniflareOptions(
		ctx,
		project,
		poolOptions,
		main
	);
	log.info(
		`Starting runtime for ${getRelativeProjectPath(project)}` +
			`${mfOptions.inspectorPort !== undefined ? ` with inspector on port ${mfOptions.inspectorPort}` : ""}` +
			`...`
	);
	const mf = new Miniflare(mfOptions);
	await mf.ready;
	return mf;
}

export function maybeGetResolvedMainPath(
	project: TestProject,
	options: WorkersPoolOptionsWithDefines
): string | undefined {
	const projectPath = getProjectPath(project);
	const main = options.main;
	if (main === undefined) {
		return;
	}
	if (typeof projectPath === "string") {
		return path.resolve(projectPath, main);
	} else {
		return path.resolve(main);
	}
}

export async function connectToMiniflareSocket(
	mf: Miniflare,
	workerName: string
) {
	const ns = await mf.getDurableObjectNamespace(
		RUNNER_OBJECT_BINDING,
		workerName
	);

	const stub = ns.getByName("singleton");

	const res = await stub.fetch("http://placeholder", {
		headers: {
			Upgrade: "websocket",
			"MF-Vitest-Worker-Data": structuredSerializableStringify({
				cwd: process.cwd(),
			}),
		},
	});

	const webSocket = res.webSocket;
	assert(webSocket !== null);

	webSocket.accept();

	return webSocket;
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

export function assertCompatibleVitestVersion(ctx: Vitest) {
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

	// Hard error on Vitest v3, which definitely won't work
	if (actualVitestVersion.startsWith("3")) {
		const message = `You're running \`vitest@${actualVitestVersion}\`, but this version of \`@cloudflare/vitest-pool-workers\` only supports \`vitest ${expectedVitestVersion}\`.`;
		throw new Error(message);
	}

	if (!semverSatisfies(actualVitestVersion, expectedVitestVersion)) {
		const message = [
			`You're running \`vitest@${actualVitestVersion}\`, but this version of \`@cloudflare/vitest-pool-workers\` only officially supports \`vitest ${expectedVitestVersion}\`.`,
			"`@cloudflare/vitest-pool-workers` currently depends on internal Vitest APIs that are not protected by semantic-versioning guarantees.",
			`Your tests may work without issue, but we can not guarantee compatibility outside of the above version range.`,
		].join("\n");
		log.warn(message);
	}
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

export { cloudflarePool } from "./pool";
export { cloudflareTest } from "./plugin";
export * from "./d1";
export * from "./pages";
