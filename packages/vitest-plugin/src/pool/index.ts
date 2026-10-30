import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import util from "node:util";
import { isNodejsCompatDefaultOn } from "@cloudflare/workers-utils";
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
} from "miniflare";
import semverMajor from "semver/functions/major.js";
import semverSatisfies from "semver/functions/satisfies.js";
import { CompatibilityFlagAssertions } from "./compatibility-flag-assertions";
import { guessWorkerExports } from "./guess-exports";
import {
	getProjectPath,
	getRelativeProjectPath,
	isFileNotFoundError,
	WORKER_NAME_PREFIX,
} from "./helpers";
import { createLoopbackHandler } from "./loopback";
import { handleModuleFallbackRequest } from "./module-fallback";
import type {
	ProjectWorkers,
	WorkersPoolOptions,
	WorkersPoolOptionsWithDefines,
} from "./config";
import type {
	MiniflareOptions,
	WorkerdStructuredLog,
	WorkerOptions,
} from "miniflare";
import type { TestProject, Vitest } from "vitest/node";

export function structuredSerializableStringify(value: unknown): string {
	// Vitest v2+ sends a sourcemap to its runner, which we can't serialise currently.
	// Stripping it doesn't seem to cause any problems, and error stack traces etc.
	// still seem to work.
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
		// Shallow-copy to avoid mutating the caller's object
		value = { ...value, r: { ...value.r, map: undefined } };
	}
	return devalue.stringify(value, structuredSerializableReducers);
}

export function structuredSerializableParse(value: string): unknown {
	return devalue.parse(value, structuredSerializableRevivers);
}

// Log for pool info/warnings/errors (user-actionable messages only)
const log = new Log(LogLevel.INFO, { prefix: "vpw" });
// Debug log gated behind NODE_DEBUG=vitest-plugin
const debug = util.debuglog("vitest-plugin");
// Log for Miniflare instances, used for user code warnings/errors
const mfLog = new Log(LogLevel.WARN);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST_PATH = path.resolve(__dirname, "..");
const POOL_WORKER_PATH = path.join(DIST_PATH, "worker/index.mjs");

const symbolizerWarning =
	"warning: Not symbolizing stack traces because $LLVM_SYMBOLIZER is not set.";
const ignoreMessages = [
	symbolizerWarning,
	// Not user actionable
	// TODO(someday): this is normal operation and really shouldn't error
	"disconnected: operation canceled",
	"disconnected: worker_do_not_log; Request failed due to internal error",
	"disconnected: WebSocket was aborted",
	"disconnected: WebSocket peer disconnected",
	"disconnected: peer disconnected without gracefully ending TLS session",
	"CODE_MOVED for unknown code block",
	"broken.outputGateBroken; jsg.Error: Instance dispose",
];
function handleStructuredLogs({ level, message }: WorkerdStructuredLog): void {
	if (ignoreMessages.some((ignore) => message.includes(ignore))) {
		return;
	}

	switch (level) {
		case "error":
		case "warn":
			process.stderr.write(`${message}\n`);
			break;
		default:
			process.stdout.write(`${message}\n`);
			break;
	}
}

export { getRunnerName } from "./helpers";

interface DurableObjectDesignator {
	className: string;
	scriptName?: string;
	unsafeUniqueKey?: string;
}
/**
 * Returns a map of the runner's Durable Object bindings' bound names to the
 * designators of the objects they point to. Durable Objects the runner exports
 * without a binding are included by class name, so their stubs from `exports`
 * work with the test helpers.
 *
 * @param options The project's parsed pool options.
 * @returns The designators, keyed by bound name or class name.
 */
export function getDurableObjectDesignators(
	options: WorkersPoolOptionsWithDefines
): Map<string /* bound name */, DurableObjectDesignator> {
	const result = new Map<string, DurableObjectDesignator>();
	const runner = options.projectWorkers?.[0];
	if (runner === undefined) {
		return result;
	}
	const runnerExports = runner.config.exports ?? {};
	const getUniqueKey = (className: string) => {
		const exported = runnerExports[className];
		return exported?.type === "durable-object" &&
			"unsafeUniqueKey" in exported &&
			typeof exported.unsafeUniqueKey === "string"
			? exported.unsafeUniqueKey
			: undefined;
	};
	const boundClassNames = new Set<string>();
	for (const [key, binding] of Object.entries(runner.config.env ?? {})) {
		if (binding.type !== "durable-object" || key === RUNNER_OBJECT_BINDING) {
			continue;
		}
		const isRunnerObject = binding.worker === runner.config.name;
		if (isRunnerObject) {
			boundClassNames.add(binding.exportName);
		}
		result.set(key, {
			className: binding.exportName,
			scriptName: isRunnerObject ? undefined : String(binding.worker),
			unsafeUniqueKey: isRunnerObject
				? getUniqueKey(binding.exportName)
				: undefined,
		});
	}
	for (const [name, exported] of Object.entries(runnerExports)) {
		if (
			exported.type === "durable-object" &&
			"storage" in exported &&
			typeof exported.unsafeUniqueKey !== "symbol" &&
			!boundClassNames.has(name) &&
			!result.has(name)
		) {
			result.set(name, {
				className: name,
				unsafeUniqueKey: getUniqueKey(name),
			});
		}
	}
	return result;
}

/**
 * Gets a set of Durable Object class names for the SELF Worker.
 *
 * This is calculated from the Durable Object bindings that point to SELF as well as the
 * Durable Objects it exports, which may not have bindings.
 */
function getDurableObjectClasses(worker: WorkerOptions["config"]): Set<string> {
	// TODO(someday): may need to extend this to take into account other workers
	//  if doing multi-worker tests across workspace projects
	// TODO(someday): may want to validate class names are valid identifiers?
	const result = new Set<string>();

	// Get all the Durable Object class names from bindings to the SELF Worker.
	for (const binding of Object.values(worker.env ?? {})) {
		if (binding.type === "durable-object" && binding.worker === worker.name) {
			result.add(binding.exportName);
		}
	}

	// And all the Durable Object class names it exports, which may not have bindings.
	for (const [name, exported] of Object.entries(worker.exports ?? {})) {
		if (exported.type === "durable-object" && "storage" in exported) {
			result.add(name);
		}
	}

	return result;
}

/**
 * Gets a set of class names for Workflows defined in the SELF Worker, either
 * declared in its `exports` or bound to it.
 */
function getWorkflowClasses(worker: WorkerOptions["config"]): Set<string> {
	// TODO(someday): may need to extend this to take into account other workers
	//  if doing multi-worker tests across workspace projects
	// TODO(someday): may want to validate class names are valid identifiers?
	const result = new Set<string>();
	for (const [name, exported] of Object.entries(worker.exports ?? {})) {
		if (exported.type === "workflow") {
			result.add(name);
		}
	}
	for (const binding of Object.values(worker.env ?? {})) {
		if (binding.type === "workflow" && binding.worker === worker.name) {
			result.add(binding.exportName);
		}
	}
	return result;
}

const SELF_SERVICE_BINDING = "__VITEST_POOL_WORKERS_SELF_SERVICE";
const LOOPBACK_SERVICE_BINDING = "__VITEST_POOL_WORKERS_LOOPBACK_SERVICE";
const RUNNER_OBJECT_BINDING = "__VITEST_POOL_WORKERS_RUNNER_OBJECT";

async function buildProjectWorkerOptions(
	ctx: Vitest,
	project: TestProject,
	customOptions: WorkersPoolOptionsWithDefines,
	main: string | undefined
): Promise<ProjectWorkers> {
	const relativeConfigPath = maybeApply(
		(v) => path.relative("", v),
		customOptions.resolvedConfig?.path
	);
	// The Worker under test and the auxiliary Workers are resolved while parsing
	assert(customOptions.projectWorkers !== undefined);
	const [userWorker, ...auxiliaryWorkers] = customOptions.projectWorkers;
	const runnerWorker = userWorker.config;

	// Make sure the worker has the `nodejs_compat` and `export_commonjs_default`
	// compatibility flags enabled. Vitest makes heavy use of Node APIs, and many
	// of the libraries it depends on expect `require()` to return
	// `module.exports` directly, rather than `{ default: module.exports }`.
	runnerWorker.compatibilityFlags ??= [];

	// By default, workerd tracks which request context a promise was created in
	// and rejects promises that resolve in a different request context. This is a
	// safety feature for production Workers to prevent data leaking between
	// requests. However, vitest-plugin runs all test files within the same
	// Durable Object, so promise resolution regularly crosses request boundaries
	// (e.g. a setup promise created for one test file resolving during another).
	// Without this flag, those promises get rejected and tests break.
	runnerWorker.compatibilityFlags.push(
		"no_handle_cross_request_promise_resolution"
	);

	const flagAssertions = new CompatibilityFlagAssertions({
		compatibilityDate: runnerWorker.compatibilityDate,
		compatibilityFlags: runnerWorker.compatibilityFlags,
		optionsPath: `miniflare`,
		relativeProjectPath: getRelativeProjectPath(project),
		relativeConfigPath,
		camelCaseConfigFields: customOptions.resolvedConfig?.newConfig ?? false,
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
		// Dropping the opt-out is enough once the compatibility date enables the
		// flag on its own; adding it as well is a workerd validation error.
		if (!isNodejsCompatDefaultOn(runnerWorker.compatibilityDate)) {
			runnerWorker.compatibilityFlags.push("nodejs_compat_v2");
		}
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
	ensureFeature(runnerWorker.compatibilityFlags, "nodejs_v8_module");
	ensureFeature(runnerWorker.compatibilityFlags, "nodejs_process_v2");

	const vitestMajorVersion = semverMajor(getVitestVersion(ctx));
	if (vitestMajorVersion >= 5) {
		// Vitest 5's spy package constructs a FinalizationRegistry when imported
		// and a WeakRef for every mock. Workerd gates both APIs behind this flag.
		ensureFeature(
			runnerWorker.compatibilityFlags,
			"weak_ref",
			"to support Vitest 5",
			runnerWorker.compatibilityDate >= "2025-05-05"
		);
	}
	// The Worker cannot read the host's installed Vitest version, so pass it
	// explicitly for its runner and coverage setup.
	runnerWorker.env ??= {};
	runnerWorker.env.__VITEST_POOL_WORKERS_VITEST_MAJOR_VERSION = {
		type: "text",
		value: String(vitestMajorVersion),
	};

	// V8 coverage drives the isolate's Profiler domain through node:inspector.
	// The real Session implementation is intentionally local-dev-only.
	const { coverage } = project.serializedConfig;
	if (coverage.enabled && coverage.provider === "v8") {
		ensureFeature(
			runnerWorker.compatibilityFlags,
			"nodejs_inspector_module",
			'because Vitest\'s `coverage.provider` is set to `"v8"`'
		);
		ensureFeature(
			runnerWorker.compatibilityFlags,
			"nodejs_inspector_local_dev",
			'because Vitest\'s `coverage.provider` is set to `"v8"`'
		);
	}

	// Make sure we define an unsafe eval binding and enable the fallback service
	userWorker.dev ??= {};
	userWorker.dev.unsafeEvalBinding = "__VITEST_POOL_WORKERS_UNSAFE_EVAL";
	userWorker.dev.useModuleFallbackService = true;

	// Make sure we define our self/loopback service bindings for helpers
	runnerWorker.env[SELF_SERVICE_BINDING] = {
		type: "worker",
		worker: kCurrentWorker,
	};
	runnerWorker.env[LOOPBACK_SERVICE_BINDING] = {
		type: "fetcher",
		handler: createLoopbackHandler(
			project.serializedConfig.coverage.coverageFilesDirectory
		),
	};

	// Build wrappers for entrypoints and Durable Objects defined in this worker
	const durableObjectClassNames = getDurableObjectClasses(runnerWorker);

	const workflowClassNames = getWorkflowClasses(runnerWorker);

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
	// which is the singleton host for running tests. It's ephemeral (in-memory)
	// because the runner doesn't need persistent state, and all disk-backed DOs
	// hit a workerd bug on Windows where SQLite paths use Unix-style forward
	// slashes (cloudflare/workerd#6110).
	runnerWorker.env[RUNNER_OBJECT_BINDING] = {
		type: "durable-object",
		worker: runnerWorker.name,
		exportName: "__VITEST_POOL_WORKERS_RUNNER_DURABLE_OBJECT__",
	};
	runnerWorker.exports ??= {};
	runnerWorker.exports.__VITEST_POOL_WORKERS_RUNNER_DURABLE_OBJECT__ = {
		type: "durable-object",
		storage: "legacy-kv",
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

	// We want module names to be their absolute path without the leading	slash
	// (i.e. the modules root should be the root directory). On Windows, we'd
	// like paths to include the drive letter (i.e. `/C:/a/b/c/index.mjs`).
	// TODO: add source URL comments to injected modules for better stack traces
	const modulesRoot = process.platform === "win32" ? "Z:\\" : "/";

	runnerWorker.manifest = {
		mainModule: "index.mjs",
		modulesRoot,
		modules: {
			"index.mjs": {
				type: "esm",
				contents: fs.readFileSync(POOL_WORKER_PATH),
			},
			__VITEST_POOL_WORKERS_USER_OBJECT: {
				type: "esm",
				contents: wrappers.join("\n"),
			},
			__VITEST_POOL_WORKERS_DEFINES: { type: "esm", contents: defines },
			// The native workerd provided nodejs modules don't always support everything Vitest needs.
			// As a short-term fix, inject polyfills into the worker bundle that override the native modules.
			"node:console": {
				type: "esm",
				contents: fs.readFileSync(
					path.join(DIST_PATH, `worker/node/console.mjs`)
				),
			},
			"node:vm": {
				type: "esm",
				contents: fs.readFileSync(path.join(DIST_PATH, `worker/node/vm.mjs`)),
			},
		},
	};

	return [userWorker, ...auxiliaryWorkers];
}

const SHARED_MINIFLARE_OPTIONS = {
	log: mfLog,
	handleStructuredLogs,
	// Keep test runs out of the dev registry, as converting V4 options did, so
	// they don't exchange calls or queue messages with `wrangler dev` sessions
	enableDevRegistry: false,
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
		ctx,
		project,
		customOptions,
		main
	);

	assert(runnerWorker.config.name !== undefined);
	assert(runnerWorker.config.name.startsWith(WORKER_NAME_PREFIX));

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
		verbose: customOptions.verbose ?? true,
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
	debug("Starting runtime for %s...", getRelativeProjectPath(project));
	if (mfOptions.inspectorPort !== undefined) {
		log.info(
			`Starting inspector on port ${mfOptions.inspectorPort} for ${getRelativeProjectPath(project)}`
		);
	}
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

	// @ts-expect-error `ColoLocalActorNamespace`s are not included in types
	const stub = ns.get("singleton");

	const res = await stub.fetch("http://placeholder", {
		headers: {
			Upgrade: "websocket",
			// Headers are restricted to the Latin-1/ASCII byte range, but `process.cwd()`
			// may contain non-ASCII characters (e.g. a workspace path with CJK
			// characters on Windows), so percent-encode the whole serialized value.
			// See https://github.com/cloudflare/workers-sdk/issues/14655
			"MF-Vitest-Worker-Data": encodeURIComponent(
				structuredSerializableStringify({
					cwd: process.cwd(),
				})
			),
		},
	});

	const webSocket = res.webSocket;
	if (webSocket === null) {
		const body = await res.text().catch(() => "");
		throw new Error(
			`Failed to establish WebSocket to runner (status ${res.status}): ${body}`
		);
	}

	webSocket.accept();

	return webSocket;
}

interface PackageJson {
	name?: string;
	version?: string;
	peerDependencies?: Record<string, string | undefined>;
	bundledVersions?: Record<string, string | undefined>;
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

/**
 * Extract the upstream vitest version from an alternative distribution's
 * package.json. Distributions like `@voidzero-dev/vite-plus-test` declare
 * the bundled vitest version in `bundledVersions.vitest`.
 */
function getUpstreamVitestVersion(pkgJson: PackageJson): string | undefined {
	return pkgJson.bundledVersions?.vitest;
}

function getVitestVersion(ctx: Vitest): string {
	const vitestPkgJson = getPackageJson(ctx.distPath);
	assert(
		vitestPkgJson !== undefined,
		"Expected to find `package.json` for `vitest`"
	);
	const actualVitestVersion =
		vitestPkgJson.name === "vitest"
			? vitestPkgJson.version
			: (getUpstreamVitestVersion(vitestPkgJson) ?? vitestPkgJson.version);
	assert(
		actualVitestVersion !== undefined,
		"Expected to find `vitest`'s version"
	);
	return actualVitestVersion;
}

export function assertCompatibleVitestVersion(ctx: Vitest) {
	// Some package managers don't enforce `peerDependencies` requirements,
	// so add a runtime sanity check to ensure things don't break in strange ways.
	const poolPkgJson = getPackageJson(__dirname);
	assert(
		poolPkgJson !== undefined,
		"Expected to find `package.json` for `@cloudflare/vitest-plugin`"
	);

	const expectedVitestVersion = poolPkgJson.peerDependencies?.vitest;
	assert(
		expectedVitestVersion !== undefined,
		"Expected to find `@cloudflare/vitest-plugin`'s `vitest` version constraint"
	);

	const actualVitestVersion = getVitestVersion(ctx);

	// Hard error on Vitest v3, which definitely won't work
	if (semverSatisfies(actualVitestVersion, "3.x")) {
		const message = `You're running \`vitest@${actualVitestVersion}\`, but this version of \`@cloudflare/vitest-plugin\` only supports \`vitest ${expectedVitestVersion}\`.`;
		throw new Error(message);
	}

	if (!semverSatisfies(actualVitestVersion, expectedVitestVersion)) {
		const message = [
			`You're running \`vitest@${actualVitestVersion}\`, but this version of \`@cloudflare/vitest-plugin\` only officially supports \`vitest ${expectedVitestVersion}\`.`,
			"`@cloudflare/vitest-plugin` currently depends on internal Vitest APIs that are not protected by semantic-versioning guarantees.",
			`Your tests may work without issue, but we can not guarantee compatibility outside of the above version range.`,
		].join("\n");
		log.warn(message);
	}
}

/**
 * Ensures that the specified compatibility feature is enabled for Vitest to work.
 * @param compatibilityFlags The list of current compatibility flags.
 * @param feature The name of the feature to enable.
 * @param reason An optional explanation of why the feature is needed.
 * @param enabledByDefault Whether the compatibility date enables this feature.
 * @returns Nothing.
 */
function ensureFeature(
	compatibilityFlags: string[],
	feature: string,
	reason = "to support the Vitest runner",
	enabledByDefault = false
): void {
	const flagToEnable = `enable_${feature}`;
	const flagToDisable = `disable_${feature}`;
	if (!enabledByDefault && !compatibilityFlags.includes(flagToEnable)) {
		debug(
			"Adding `%s` compatibility flag during tests as this feature is needed %s.",
			flagToEnable,
			reason
		);
		compatibilityFlags.push(flagToEnable);
	}
	if (compatibilityFlags.includes(flagToDisable)) {
		log.warn(
			`Removing \`${flagToDisable}\` compatibility flag during tests as that feature is needed ${reason}.`
		);
		compatibilityFlags.splice(compatibilityFlags.indexOf(flagToDisable), 1);
	}
}

export { cloudflarePool } from "./pool";
export { cloudflareTest } from "./plugin";
export * from "./d1";
export * from "./pages";
