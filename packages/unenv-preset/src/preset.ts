import { version } from "../package.json";
import type { Preset } from "unenv";

// Built-in APIs provided by workerd.
//
// https://developers.cloudflare.com/workers/runtime-apis/nodejs/
// https://github.com/cloudflare/workerd/tree/main/src/node
//
// NOTE: Please sync any changes to `testNodeCompatModules`.
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

// Modules implemented via a mix of workerd APIs and polyfills.
const hybridModules = ["process"];

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
	];

	// "dynamic" as they depend on the compatibility date and flags
	const dynamicHybridModules = [
		...hybridModules,
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
			process: "@cloudflare/unenv-preset/node/process",
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
