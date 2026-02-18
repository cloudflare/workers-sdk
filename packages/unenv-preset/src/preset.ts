import { version } from "../package.json";
import type { Preset } from "unenv";

// Built-in APIs provided by workerd.
//
// https://developers.cloudflare.com/workers/runtime-apis/nodejs/
// https://github.com/cloudflare/workerd/tree/main/src/node
const nativeModules = [
	"_stream_duplex",
	"_stream_passthrough",
	"_stream_readable",
	"_stream_transform",
	"_stream_writable",
	"_tls_common",
	"_tls_wrap",
	"assert",
	"assert/strict",
	"async_hooks",
	"buffer",
	"constants",
	"crypto",
	"diagnostics_channel",
	"dns",
	"dns/promises",
	"events",
	"net",
	"path",
	"path/posix",
	"path/win32",
	"querystring",
	"module",
	"stream",
	"stream/consumers",
	"stream/promises",
	"stream/web",
	"string_decoder",
	"sys",
	"timers",
	"timers/promises",
	"tls",
	"url",
	"util",
	"util/types",
	"zlib",
];

/**
 * Creates the Cloudflare preset for the given compatibility date and compatibility flags
 *
 * @param compatibilityDate workerd compatibility date
 * @param compatibilityFlags workerd compatibility flags
 * @returns The cloudflare preset
 */
export function getCloudflarePreset({
	compatibilityDate = "2024-09-03",
	compatibilityFlags = [],
}: {
	compatibilityDate?: string;
	compatibilityFlags?: string[];
}): Preset {
	const compat = {
		compatibilityDate,
		compatibilityFlags,
	};

	const httpOverrides = getHttpOverrides(compat);
	const http2Overrides = getHttp2Overrides(compat);
	const osOverrides = getOsOverrides(compat);
	const fsOverrides = getFsOverrides(compat);
	const punycodeOverrides = getPunycodeOverrides(compat);
	const clusterOverrides = getClusterOverrides(compat);
	const traceEventsOverrides = getTraceEventsOverrides(compat);
	const domainOverrides = getDomainOverrides(compat);
	const wasiOverrides = getWasiOverrides(compat);
	const consoleOverrides = getConsoleOverrides(compat);
	const vmOverrides = getVmOverrides(compat);
	const inspectorOverrides = getInspectorOverrides(compat);
	const sqliteOverrides = getSqliteOverrides(compat);
	const dgramOverrides = getDgramOverrides(compat);
	const streamWrapOverrides = getStreamWrapOverrides(compat);
	const replOverrides = getReplOverrides(compat);
	const processOverrides = getProcessOverrides(compat);
	const v8Overrides = getV8Overrides(compat);
	const ttyOverrides = getTtyOverrides(compat);
	const childProcessOverrides = getChildProcessOverrides(compat);
	const workerThreadsOverrides = getWorkerThreadsOverrides(compat);

	// "dynamic" as they depend on the compatibility date and flags
	const dynamicNativeModules = [
		...nativeModules,
		...httpOverrides.nativeModules,
		...http2Overrides.nativeModules,
		...osOverrides.nativeModules,
		...fsOverrides.nativeModules,
		...punycodeOverrides.nativeModules,
		...clusterOverrides.nativeModules,
		...traceEventsOverrides.nativeModules,
		...domainOverrides.nativeModules,
		...wasiOverrides.nativeModules,
		...consoleOverrides.nativeModules,
		...vmOverrides.nativeModules,
		...inspectorOverrides.nativeModules,
		...sqliteOverrides.nativeModules,
		...dgramOverrides.nativeModules,
		...streamWrapOverrides.nativeModules,
		...replOverrides.nativeModules,
		...processOverrides.nativeModules,
		...v8Overrides.nativeModules,
		...ttyOverrides.nativeModules,
		...childProcessOverrides.nativeModules,
		...workerThreadsOverrides.nativeModules,
	];

	// "dynamic" as they depend on the compatibility date and flags
	const dynamicHybridModules = [
		...httpOverrides.hybridModules,
		...http2Overrides.hybridModules,
		...osOverrides.hybridModules,
		...fsOverrides.hybridModules,
		...punycodeOverrides.hybridModules,
		...clusterOverrides.hybridModules,
		...traceEventsOverrides.hybridModules,
		...domainOverrides.hybridModules,
		...wasiOverrides.hybridModules,
		...consoleOverrides.hybridModules,
		...vmOverrides.hybridModules,
		...inspectorOverrides.hybridModules,
		...sqliteOverrides.hybridModules,
		...dgramOverrides.hybridModules,
		...streamWrapOverrides.hybridModules,
		...replOverrides.hybridModules,
		...processOverrides.hybridModules,
		...v8Overrides.hybridModules,
		...ttyOverrides.hybridModules,
		...childProcessOverrides.hybridModules,
		...workerThreadsOverrides.hybridModules,
	];

	return {
		meta: {
			name: "unenv:cloudflare",
			version,
			url: __filename,
		},
		alias: {
			// `nodeCompatModules` are implemented in workerd.
			// Create aliases to override polyfills defined in based environments.
			...Object.fromEntries(
				dynamicNativeModules.flatMap((p) => [
					[p, p],
					[`node:${p}`, `node:${p}`],
				])
			),

			// `hybridNodeCompatModules` are implemented by the cloudflare preset.
			...Object.fromEntries(
				dynamicHybridModules.flatMap((m) => [
					[m, `@cloudflare/unenv-preset/node/${m}`],
					[`node:${m}`, `@cloudflare/unenv-preset/node/${m}`],
				])
			),
		},
		inject: {
			// Setting symbols implemented by workerd to `false` so that `inject`s defined in base presets are not used.
			Buffer: false,
			global: false,
			clearImmediate: false,
			setImmediate: false,
			...consoleOverrides.inject,
			...processOverrides.inject,
		},
		polyfill: ["@cloudflare/unenv-preset/polyfill/performance"],
		external: dynamicNativeModules.flatMap((p) => [p, `node:${p}`]),
	};
}

/**
 * Returns the overrides for node http modules (unenv or workerd)
 *
 * The native http implementation (excluding server APIs):
 * - is enabled starting from 2025-08-15
 * - can be enabled with the "enable_nodejs_http_modules" flag
 * - can be disabled with the "disable_nodejs_http_modules" flag
 *
 * The native http server APIS implementation:
 * - is enabled starting from 2025-09-15
 * - can be enabled with the "enable_nodejs_http_server_modules" flag
 * - can be disabled with the "disable_nodejs_http_server_modules" flag
 */
function getHttpOverrides({
	compatibilityDate,
	compatibilityFlags,
}: {
	compatibilityDate: string;
	compatibilityFlags: string[];
}): { nativeModules: string[]; hybridModules: string[] } {
	const httpDisabledByFlag = compatibilityFlags.includes(
		"disable_nodejs_http_modules"
	);
	const httpEnabledByFlag = compatibilityFlags.includes(
		"enable_nodejs_http_modules"
	);
	const httpEnabledByDate = compatibilityDate >= "2025-08-15";

	const httpEnabled =
		(httpEnabledByFlag || httpEnabledByDate) && !httpDisabledByFlag;

	if (!httpEnabled) {
		// use the unenv polyfill
		return { nativeModules: [], hybridModules: [] };
	}

	const httpServerEnabledByFlag = compatibilityFlags.includes(
		"enable_nodejs_http_server_modules"
	);

	const httpServerDisabledByFlag = compatibilityFlags.includes(
		"disable_nodejs_http_server_modules"
	);

	const httpServerEnabledByDate = compatibilityDate >= "2025-09-01";

	// Note that `httpServerEnabled` requires `httpEnabled`
	const httpServerEnabled =
		(httpServerEnabledByFlag || httpServerEnabledByDate) &&
		!httpServerDisabledByFlag;

	return {
		nativeModules: [
			"_http_agent",
			"_http_client",
			"_http_common",
			"_http_incoming",
			"_http_outgoing",
			// `_http_server` can only be imported when the server flag is set
			// See https://github.com/cloudflare/workerd/blob/56efc04/src/workerd/api/node/node.h#L102-L106
			...(httpServerEnabled ? ["_http_server"] : []),
			"http",
			"https",
		],
		hybridModules: [],
	};
}

/**
 * Returns the overrides for the `node:http2` module (unenv or workerd)
 *
 * The native http2 implementation:
 * - is enabled starting from 2025-09-01
 * - can be enabled with the "enable_nodejs_http2_module" flag
 * - can be disabled with the "disable_nodejs_http2_module" flag
 */
function getHttp2Overrides({
	compatibilityDate,
	compatibilityFlags,
}: {
	compatibilityDate: string;
	compatibilityFlags: string[];
}): { nativeModules: string[]; hybridModules: string[] } {
	const disabledByFlag = compatibilityFlags.includes(
		"disable_nodejs_http2_module"
	);
	const enabledByFlag = compatibilityFlags.includes(
		"enable_nodejs_http2_module"
	);
	const enabledByDate = compatibilityDate >= "2025-09-01";

	const enabled = (enabledByFlag || enabledByDate) && !disabledByFlag;

	return enabled
		? {
				nativeModules: ["http2"],
				hybridModules: [],
			}
		: {
				nativeModules: [],
				hybridModules: [],
			};
}

/**
 * Returns the overrides for `node:os` (unenv or workerd)
 *
 * The native os implementation:
 * - is enabled starting from 2025-09-15
 * - can be enabled with the "enable_nodejs_os_module" flag
 * - can be disabled with the "disable_nodejs_os_module" flag
 */
function getOsOverrides({
	compatibilityDate,
	compatibilityFlags,
}: {
	compatibilityDate: string;
	compatibilityFlags: string[];
}): { nativeModules: string[]; hybridModules: string[] } {
	const disabledByFlag = compatibilityFlags.includes(
		"disable_nodejs_os_module"
	);

	const enabledByFlag = compatibilityFlags.includes("enable_nodejs_os_module");
	const enabledByDate = compatibilityDate >= "2025-09-15";

	const enabled = (enabledByFlag || enabledByDate) && !disabledByFlag;

	// The native os module implements all the APIs.
	// It can then be used as a native module.
	return enabled
		? {
				nativeModules: ["os"],
				hybridModules: [],
			}
		: {
				nativeModules: [],
				hybridModules: [],
			};
}

/**
 * Returns the overrides for `node:fs` and `node:fs/promises` (unenv or workerd)
 *
 * The native fs implementation:
 * - is enabled starting from 2025-09-15
 * - can be enabled with the "enable_nodejs_fs_module" flag
 * - can be disabled with the "disable_nodejs_fs_module" flag
 */
function getFsOverrides({
	compatibilityDate,
	compatibilityFlags,
}: {
	compatibilityDate: string;
	compatibilityFlags: string[];
}): { nativeModules: string[]; hybridModules: string[] } {
	const disabledByFlag = compatibilityFlags.includes(
		"disable_nodejs_fs_module"
	);

	const enabledByFlag = compatibilityFlags.includes("enable_nodejs_fs_module");
	const enabledByDate = compatibilityDate >= "2025-09-15";

	const enabled = (enabledByFlag || enabledByDate) && !disabledByFlag;

	// The native `fs` and `fs/promises` modules implement all the node APIs so we can use them directly
	return enabled
		? {
				nativeModules: ["fs/promises", "fs"],
				hybridModules: [],
			}
		: {
				nativeModules: [],
				hybridModules: [],
			};
}

/**
 * Returns the overrides for `node:punycode` (unenv or workerd)
 *
 * The native punycode implementation:
 * - is enabled starting from 2025-12-04
 * - can be enabled with the "enable_nodejs_punycode_module" flag
 * - can be disabled with the "disable_nodejs_punycode_module" flag
 */
function getPunycodeOverrides({
	compatibilityDate,
	compatibilityFlags,
}: {
	compatibilityDate: string;
	compatibilityFlags: string[];
}): { nativeModules: string[]; hybridModules: string[] } {
	const disabledByFlag = compatibilityFlags.includes(
		"disable_nodejs_punycode_module"
	);

	const enabledByFlag = compatibilityFlags.includes(
		"enable_nodejs_punycode_module"
	);

	const enabledByDate = compatibilityDate >= "2025-12-04";

	const enabled = (enabledByFlag || enabledByDate) && !disabledByFlag;

	return enabled
		? {
				nativeModules: ["punycode"],
				hybridModules: [],
			}
		: {
				nativeModules: [],
				hybridModules: [],
			};
}

/**
 * Returns the overrides for `node:cluster` (unenv or workerd)
 *
 * The native cluster implementation:
 * - is enabled starting from 2025-12-04
 * - can be enabled with the "enable_nodejs_cluster_module" flag
 * - can be disabled with the "disable_nodejs_cluster_module" flag
 */
function getClusterOverrides({
	compatibilityDate,
	compatibilityFlags,
}: {
	compatibilityDate: string;
	compatibilityFlags: string[];
}): { nativeModules: string[]; hybridModules: string[] } {
	const disabledByFlag = compatibilityFlags.includes(
		"disable_nodejs_cluster_module"
	);

	const enabledByFlag = compatibilityFlags.includes(
		"enable_nodejs_cluster_module"
	);

	const enabledByDate = compatibilityDate >= "2025-12-04";

	const enabled = (enabledByFlag || enabledByDate) && !disabledByFlag;

	return enabled
		? {
				nativeModules: ["cluster"],
				hybridModules: [],
			}
		: {
				nativeModules: [],
				hybridModules: [],
			};
}

/**
 * Returns the overrides for `node:trace_events` (unenv or workerd)
 *
 * The native trace_events implementation:
 * - is enabled starting from 2025-12-04
 * - can be enabled with the "enable_nodejs_trace_events_module" flag
 * - can be disabled with the "disable_nodejs_trace_events_module" flag
 */
function getTraceEventsOverrides({
	compatibilityDate,
	compatibilityFlags,
}: {
	compatibilityDate: string;
	compatibilityFlags: string[];
}): { nativeModules: string[]; hybridModules: string[] } {
	const disabledByFlag = compatibilityFlags.includes(
		"disable_nodejs_trace_events_module"
	);

	const enabledByFlag = compatibilityFlags.includes(
		"enable_nodejs_trace_events_module"
	);

	const enabledByDate = compatibilityDate >= "2025-12-04";

	const enabled = (enabledByFlag || enabledByDate) && !disabledByFlag;

	return enabled
		? {
				nativeModules: ["trace_events"],
				hybridModules: [],
			}
		: {
				nativeModules: [],
				hybridModules: [],
			};
}

/**
 * Returns the overrides for `node:domain` (unenv or workerd)
 *
 * The native domain implementation:
 * - is enabled starting from 2025-12-04
 * - can be enabled with the "enable_nodejs_domain_module" flag
 * - can be disabled with the "disable_nodejs_domain_module" flag
 */
function getDomainOverrides({
	compatibilityDate,
	compatibilityFlags,
}: {
	compatibilityDate: string;
	compatibilityFlags: string[];
}): { nativeModules: string[]; hybridModules: string[] } {
	const disabledByFlag = compatibilityFlags.includes(
		"disable_nodejs_domain_module"
	);

	const enabledByFlag = compatibilityFlags.includes(
		"enable_nodejs_domain_module"
	);

	const enabledByDate = compatibilityDate >= "2025-12-04";

	const enabled = (enabledByFlag || enabledByDate) && !disabledByFlag;

	return enabled
		? {
				nativeModules: ["domain"],
				hybridModules: [],
			}
		: {
				nativeModules: [],
				hybridModules: [],
			};
}

/**
 * Returns the overrides for `node:wasi` (unenv or workerd)
 *
 * The native wasi implementation:
 * - is enabled starting from 2025-12-04
 * - can be enabled with the "enable_nodejs_wasi_module" flag
 * - can be disabled with the "disable_nodejs_wasi_module" flag
 */
function getWasiOverrides({
	compatibilityDate,
	compatibilityFlags,
}: {
	compatibilityDate: string;
	compatibilityFlags: string[];
}): { nativeModules: string[]; hybridModules: string[] } {
	const disabledByFlag = compatibilityFlags.includes(
		"disable_nodejs_wasi_module"
	);

	const enabledByFlag = compatibilityFlags.includes(
		"enable_nodejs_wasi_module"
	);

	const enabledByDate = compatibilityDate >= "2025-12-04";

	const enabled = (enabledByFlag || enabledByDate) && !disabledByFlag;

	return enabled
		? {
				nativeModules: ["wasi"],
				hybridModules: [],
			}
		: {
				nativeModules: [],
				hybridModules: [],
			};
}

/**
 * Returns the overrides for `node:console` (unenv or workerd)
 *
 * The native console implementation:
 * - is enabled starting from 2025-09-21
 * - can be enabled with the "enable_nodejs_console_module" flag
 * - can be disabled with the "disable_nodejs_console_module" flag
 */
function getConsoleOverrides({
	compatibilityDate,
	compatibilityFlags,
}: {
	compatibilityDate: string;
	compatibilityFlags: string[];
}): {
	nativeModules: string[];
	hybridModules: string[];
	inject: Record<string, string>;
} {
	const disabledByFlag = compatibilityFlags.includes(
		"disable_nodejs_console_module"
	);

	const enabledByFlag = compatibilityFlags.includes(
		"enable_nodejs_console_module"
	);
	const enabledByDate = compatibilityDate >= "2025-09-21";

	const enabled = (enabledByFlag || enabledByDate) && !disabledByFlag;

	// The native `console` module implements all the node APIs so we can use them directly
	return enabled
		? {
				nativeModules: ["console"],
				hybridModules: [],
				inject: {},
			}
		: {
				nativeModules: [],
				hybridModules: ["console"],
				inject: { console: "@cloudflare/unenv-preset/node/console" },
			};
}

/**
 * Returns the overrides for `node:vm` (unenv or workerd)
 *
 * The native vm implementation:
 * - is enabled starting from 2025-10-01
 * - can be enabled with the "enable_nodejs_vm_module" flag
 * - can be disabled with the "disable_nodejs_vm_module" flag
 */
function getVmOverrides({
	compatibilityDate,
	compatibilityFlags,
}: {
	compatibilityDate: string;
	compatibilityFlags: string[];
}): { nativeModules: string[]; hybridModules: string[] } {
	const disabledByFlag = compatibilityFlags.includes(
		"disable_nodejs_vm_module"
	);

	const enabledByFlag = compatibilityFlags.includes("enable_nodejs_vm_module");
	const enabledByDate = compatibilityDate >= "2025-10-01";

	const enabled = (enabledByFlag || enabledByDate) && !disabledByFlag;

	// The native `vm` module implements all the node APIs so we can use it directly
	return enabled
		? {
				nativeModules: ["vm"],
				hybridModules: [],
			}
		: {
				nativeModules: [],
				hybridModules: [],
			};
}

/**
 * Returns the overrides for `node:inspector` and `node:inspector/promises` (unenv or workerd)
 *
 * The native inspector implementation:
 * - is enabled starting from 2026-01-29
 * - can be enabled with the "enable_nodejs_inspector_module" flag
 * - can be disabled with the "disable_nodejs_inspector_module" flag
 */
function getInspectorOverrides({
	compatibilityDate,
	compatibilityFlags,
}: {
	compatibilityDate: string;
	compatibilityFlags: string[];
}): { nativeModules: string[]; hybridModules: string[] } {
	const disabledByFlag = compatibilityFlags.includes(
		"disable_nodejs_inspector_module"
	);

	const enabledByFlag = compatibilityFlags.includes(
		"enable_nodejs_inspector_module"
	);
	const enabledByDate = compatibilityDate >= "2026-01-29";

	const enabled = (enabledByFlag || enabledByDate) && !disabledByFlag;

	// When enabled, use the native `inspector` module from workerd
	return enabled
		? {
				nativeModules: ["inspector/promises", "inspector"],
				hybridModules: [],
			}
		: {
				nativeModules: [],
				hybridModules: [],
			};
}

/**
 * Returns the overrides for `node:sqlite` (unenv or workerd)
 *
 * The native sqlite implementation:
 * - is enabled starting from 2026-01-29
 * - can be enabled with the "enable_nodejs_sqlite_module" flag
 * - can be disabled with the "disable_nodejs_sqlite_module" flag
 */
function getSqliteOverrides({
	compatibilityDate,
	compatibilityFlags,
}: {
	compatibilityDate: string;
	compatibilityFlags: string[];
}): { nativeModules: string[]; hybridModules: string[] } {
	const disabledByFlag = compatibilityFlags.includes(
		"disable_nodejs_sqlite_module"
	);

	const enabledByFlag = compatibilityFlags.includes(
		"enable_nodejs_sqlite_module"
	);
	const enabledByDate = compatibilityDate >= "2026-01-29";

	const enabled = (enabledByFlag || enabledByDate) && !disabledByFlag;

	// When enabled, use the native `sqlite` module from workerd
	return enabled
		? {
				nativeModules: ["sqlite"],
				hybridModules: [],
			}
		: {
				nativeModules: [],
				hybridModules: [],
			};
}

/**
 * Returns the overrides for `node:dgram` (unenv or workerd)
 *
 * The native dgram implementation:
 * - is enabled starting from 2026-01-29
 * - can be enabled with the "enable_nodejs_dgram_module" flag
 * - can be disabled with the "disable_nodejs_dgram_module" flag
 */
function getDgramOverrides({
	compatibilityDate,
	compatibilityFlags,
}: {
	compatibilityDate: string;
	compatibilityFlags: string[];
}): { nativeModules: string[]; hybridModules: string[] } {
	const disabledByFlag = compatibilityFlags.includes(
		"disable_nodejs_dgram_module"
	);

	const enabledByFlag = compatibilityFlags.includes(
		"enable_nodejs_dgram_module"
	);

	const enabledByDate = compatibilityDate >= "2026-01-29";
	const enabled = (enabledByFlag || enabledByDate) && !disabledByFlag;

	// When enabled, use the native `dgram` module from workerd
	return enabled
		? {
				nativeModules: ["dgram"],
				hybridModules: [],
			}
		: {
				nativeModules: [],
				hybridModules: [],
			};
}

/**
 * Returns the overrides for `node:_stream_wrap` (unenv or workerd)
 *
 * The native _stream_wrap implementation:
 * - is enabled starting from 2026-01-29
 * - can be enabled with the "enable_nodejs_stream_wrap_module" flag
 * - can be disabled with the "disable_nodejs_stream_wrap_module" flag
 */
function getStreamWrapOverrides({
	compatibilityDate,
	compatibilityFlags,
}: {
	compatibilityDate: string;
	compatibilityFlags: string[];
}): { nativeModules: string[]; hybridModules: string[] } {
	const disabledByFlag = compatibilityFlags.includes(
		"disable_nodejs_stream_wrap_module"
	);

	const enabledByFlag = compatibilityFlags.includes(
		"enable_nodejs_stream_wrap_module"
	);

	const enabledByDate = compatibilityDate >= "2026-01-29";
	const enabled = (enabledByFlag || enabledByDate) && !disabledByFlag;

	// When enabled, use the native `_stream_wrap` module from workerd
	return enabled
		? {
				nativeModules: ["_stream_wrap"],
				hybridModules: [],
			}
		: {
				nativeModules: [],
				hybridModules: [],
			};
}

/**
 * Returns the overrides for `node:repl` (unenv or workerd)
 *
 * The native repl implementation:
 * - is experimental and has no default enable date
 * - can be enabled with the "enable_nodejs_repl_module" flag
 * - can be disabled with the "disable_nodejs_repl_module" flag
 */
function getReplOverrides({
	compatibilityFlags,
}: {
	compatibilityDate: string;
	compatibilityFlags: string[];
}): { nativeModules: string[]; hybridModules: string[] } {
	const disabledByFlag = compatibilityFlags.includes(
		"disable_nodejs_repl_module"
	);

	const enabledByFlag =
		compatibilityFlags.includes("enable_nodejs_repl_module") &&
		compatibilityFlags.includes("experimental");

	const enabled = enabledByFlag && !disabledByFlag;

	// When enabled, use the native `repl` module from workerd
	return enabled
		? {
				nativeModules: ["repl"],
				hybridModules: [],
			}
		: {
				nativeModules: [],
				hybridModules: [],
			};
}

/**
 * Returns the overrides for `node:process` (unenv or workerd)
 *
 * The native process v2 implementation:
 * - is enabled starting from 2025-09-15
 * - can be enabled with the "enable_nodejs_process_v2" flag
 * - can be disabled with the "disable_nodejs_process_v2" flag
 * - can only be used when the fixes for iterable request/response bodies are enabled
 */
function getProcessOverrides({
	compatibilityDate,
	compatibilityFlags,
}: {
	compatibilityDate: string;
	compatibilityFlags: string[];
}): {
	nativeModules: string[];
	hybridModules: string[];
	inject: { process: string | false };
} {
	const disabledV2ByFlag = compatibilityFlags.includes(
		"disable_nodejs_process_v2"
	);

	const enabledV2ByFlag = compatibilityFlags.includes(
		"enable_nodejs_process_v2"
	);
	const enabledV2ByDate = compatibilityDate >= "2025-09-15";

	// When `node:process` v2 is enabled, astro will detect workerd as it was Node.js.
	// This causes astro to take a code path that uses iterable request/response bodies.
	// So we need to make sure that the fixes for iterable bodies are also enabled.
	// @see https://github.com/cloudflare/workers-sdk/issues/10855
	const hasFixes = hasFetchIterableFixes({
		compatibilityDate,
		compatibilityFlags,
	});

	const useV2 =
		hasFixes && (enabledV2ByFlag || enabledV2ByDate) && !disabledV2ByFlag;

	return useV2
		? {
				nativeModules: ["process"],
				hybridModules: [],
				// We can use the native global, return `false` to drop the unenv default
				inject: { process: false },
			}
		: {
				nativeModules: [],
				hybridModules: ["process"],
				// Use the module default export as the global `process`
				inject: { process: "@cloudflare/unenv-preset/node/process" },
			};
}

/**
 * Workerd fixes iterable request/response bodies when both these compatibility flags are used:
 * - `fetch_iterable_type_support`
 * - `fetch_iterable_type_support_override_adjustment`
 *
 * @see https://github.com/cloudflare/workerd/issues/2746
 * @see https://github.com/cloudflare/workerd/blob/main/src/workerd/io/compatibility-date.capnp
 */
function hasFetchIterableFixes({
	compatibilityDate,
	compatibilityFlags,
}: {
	compatibilityDate: string;
	compatibilityFlags: string[];
}): boolean {
	const supportEnabledByFlag = compatibilityFlags.includes(
		"fetch_iterable_type_support"
	);

	const supportDisabledByFlag = compatibilityFlags.includes(
		"no_fetch_iterable_type_support"
	);

	const supportEnabledByDate = compatibilityDate >= "2026-02-19";

	const supportEnabled =
		(supportEnabledByDate || supportEnabledByFlag) && !supportDisabledByFlag;

	if (!supportEnabled) {
		return false;
	}

	const adjustmentEnabledByFlag = compatibilityFlags.includes(
		"fetch_iterable_type_support_override_adjustment"
	);
	const adjustmentDisabledByFlag = compatibilityFlags.includes(
		"no_fetch_iterable_type_support_override_adjustment"
	);
	// At this point, we know that `supportEnabled` is `true`
	const adjustmentImpliedBySupport = compatibilityDate >= "2026-01-15";

	const adjustmentEnabled =
		(adjustmentEnabledByFlag || adjustmentImpliedBySupport) &&
		!adjustmentDisabledByFlag;

	return adjustmentEnabled;
}

/**
 * Returns the overrides for `node:v8` (unenv or workerd)
 *
 * The native v8 implementation:
 * - is experimental and has no default enable date
 * - can be enabled with the "enable_nodejs_v8_module" flag
 * - can be disabled with the "disable_nodejs_v8_module" flag
 */
function getV8Overrides({
	compatibilityFlags,
}: {
	compatibilityDate: string;
	compatibilityFlags: string[];
}): { nativeModules: string[]; hybridModules: string[] } {
	const disabledByFlag = compatibilityFlags.includes(
		"disable_nodejs_v8_module"
	);

	const enabledByFlag =
		compatibilityFlags.includes("enable_nodejs_v8_module") &&
		compatibilityFlags.includes("experimental");

	const enabled = enabledByFlag && !disabledByFlag;

	// When enabled, use the native `v8` module from workerd
	return enabled
		? {
				nativeModules: ["v8"],
				hybridModules: [],
			}
		: {
				nativeModules: [],
				hybridModules: [],
			};
}

/**
 * Returns the overrides for `node:tty` (unenv or workerd)
 *
 * The native tty implementation:
 * - is experimental and has no default enable date
 * - can be enabled with the "enable_nodejs_tty_module" flag
 * - can be disabled with the "disable_nodejs_tty_module" flag
 */
function getTtyOverrides({
	compatibilityFlags,
}: {
	compatibilityDate: string;
	compatibilityFlags: string[];
}): { nativeModules: string[]; hybridModules: string[] } {
	const disabledByFlag = compatibilityFlags.includes(
		"disable_nodejs_tty_module"
	);

	const enabledByFlag =
		compatibilityFlags.includes("enable_nodejs_tty_module") &&
		compatibilityFlags.includes("experimental");

	const enabled = enabledByFlag && !disabledByFlag;

	// When enabled, use the native `tty` module from workerd
	return enabled
		? {
				nativeModules: ["tty"],
				hybridModules: [],
			}
		: {
				nativeModules: [],
				hybridModules: [],
			};
}

/**
 * Returns the overrides for `node:child_process` (unenv or workerd)
 *
 * The native child_process implementation:
 * - is experimental and has no default enable date
 * - can be enabled with the "enable_nodejs_child_process_module" flag
 * - can be disabled with the "disable_nodejs_child_process_module" flag
 */
function getChildProcessOverrides({
	compatibilityFlags,
}: {
	compatibilityDate: string;
	compatibilityFlags: string[];
}): { nativeModules: string[]; hybridModules: string[] } {
	const disabledByFlag = compatibilityFlags.includes(
		"disable_nodejs_child_process_module"
	);

	const enabledByFlag =
		compatibilityFlags.includes("enable_nodejs_child_process_module") &&
		compatibilityFlags.includes("experimental");

	const enabled = enabledByFlag && !disabledByFlag;

	// When enabled, use the native `child_process` module from workerd
	return enabled
		? {
				nativeModules: ["child_process"],
				hybridModules: [],
			}
		: {
				nativeModules: [],
				hybridModules: [],
			};
}

/**
 * Returns the overrides for `node:worker_threads` (unenv or workerd)
 *
 * The native worker_threads implementation:
 * - can be enabled with the "enable_nodejs_worker_threads_module" flag
 * - can be disabled with the "disable_nodejs_worker_threads_module" flag
 * - is experimental (no default enable date)
 */
function getWorkerThreadsOverrides({
	compatibilityFlags,
}: {
	compatibilityDate: string;
	compatibilityFlags: string[];
}): { nativeModules: string[]; hybridModules: string[] } {
	const disabledByFlag = compatibilityFlags.includes(
		"disable_nodejs_worker_threads_module"
	);

	const enabledByFlag =
		compatibilityFlags.includes("enable_nodejs_worker_threads_module") &&
		compatibilityFlags.includes("experimental");

	// worker_threads is experimental, no default enable date
	const enabled = enabledByFlag && !disabledByFlag;

	// When enabled, use the native `worker_threads` module from workerd
	return enabled
		? {
				nativeModules: ["worker_threads"],
				hybridModules: [],
			}
		: {
				nativeModules: [],
				hybridModules: [],
			};
}
