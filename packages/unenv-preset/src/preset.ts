import { version } from "../package.json";
import type { Preset } from "unenv";

// Built-in APIs provided by workerd that do not need individual compatibility flags or dates.
//
// https://developers.cloudflare.com/workers/runtime-apis/nodejs/
// https://github.com/cloudflare/workerd/tree/main/src/node
const defaultNativeModules = [
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
}: Partial<Compatibility>): Preset {
	const compat = {
		compatibilityDate,
		compatibilityFlags,
	};

	const overrides: Override[] = [
		getHttpOverrides(compat),
		getHttp2Overrides(compat),
		getOsOverrides(compat),
		getFsOverrides(compat),
		getPunycodeOverrides(compat),
		getClusterOverrides(compat),
		getTraceEventsOverrides(compat),
		getDomainOverrides(compat),
		getWasiOverrides(compat),
		getConsoleOverrides(compat),
		getVmOverrides(compat),
		getInspectorOverrides(compat),
		getSqliteOverrides(compat),
		getDgramOverrides(compat),
		getStreamWrapOverrides(compat),
		getReplOverrides(compat),
		getProcessOverrides(compat),
		getV8Overrides(compat),
		getTtyOverrides(compat),
		getChildProcessOverrides(compat),
		getWorkerThreadsOverrides(compat),
		getReadlineOverrides(compat),
		getPerfHooksOverrides(compat),
	];

	const nativeModules = [
		...defaultNativeModules,
		...overrides.flatMap((o) => o.nativeModules),
	];
	const hybridModules = overrides.flatMap((o) => o.hybridModules);
	const injects = Object.assign({}, ...overrides.map((o) => o.inject ?? {}));
	const polyfills = overrides.flatMap((o) => o.polyfills ?? []);

	return {
		meta: {
			name: "unenv:cloudflare",
			version,
			url: __filename,
		},
		alias: {
			// Alias each native module (and its `node:...` equivalent) to itself to ensure we override any polyfills from the base unenv presets.
			...Object.fromEntries(
				nativeModules.flatMap((p) => [
					[p, p],
					[`node:${p}`, `node:${p}`],
				])
			),

			// Alias each hybrid module (and its `node:...` equivalent) to its unenv polyfill implementation.
			...Object.fromEntries(
				hybridModules.flatMap((m) => [
					[m, `@cloudflare/unenv-preset/node/${m}`],
					[`node:${m}`, `@cloudflare/unenv-preset/node/${m}`],
				])
			),
		},
		inject: {
			// Do not inject globals implemented natively by workerd. Setting the value to `false` ensures that any base preset inject is not used.
			Buffer: false,
			global: false,
			clearImmediate: false,
			setImmediate: false,
			// Inject globals provided by unenv for the current compat date and flags.
			...injects,
		},
		polyfill: polyfills,
		external: nativeModules.flatMap((p) => [p, `node:${p}`]),
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
 * The native http server APIs implementation:
 * - is enabled starting from 2025-09-01
 * - can be enabled with the "enable_nodejs_http_server_modules" flag
 * - can be disabled with the "disable_nodejs_http_server_modules" flag
 */
function getHttpOverrides({
	compatibilityDate,
	compatibilityFlags,
}: Compatibility): Override {
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
}: Compatibility): Override {
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
}: Compatibility): Override {
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
}: Compatibility): Override {
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
}: Compatibility): Override {
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
}: Compatibility): Override {
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
}: Compatibility): Override {
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
}: Compatibility): Override {
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
}: Compatibility): Override {
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
}: Compatibility): Override {
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
}: Compatibility): Override {
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
}: Compatibility): Override {
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
}: Compatibility): Override {
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
}: Compatibility): Override {
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
}: Compatibility): Override {
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
 * - is enabled starting from 2026-03-17
 * - can be enabled with the "enable_nodejs_repl_module" flag
 * - can be disabled with the "disable_nodejs_repl_module" flag
 */
function getReplOverrides({
	compatibilityDate,
	compatibilityFlags,
}: Compatibility): Override {
	const disabledByFlag = compatibilityFlags.includes(
		"disable_nodejs_repl_module"
	);

	const enabledByFlag = compatibilityFlags.includes(
		"enable_nodejs_repl_module"
	);
	const enabledByDate = compatibilityDate >= "2026-03-17";

	const enabled = (enabledByFlag || enabledByDate) && !disabledByFlag;

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
}: Compatibility): Override {
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
}: Compatibility): boolean {
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
 * - is enabled starting from 2026-03-17
 * - can be enabled with the "enable_nodejs_v8_module" flag
 * - can be disabled with the "disable_nodejs_v8_module" flag
 */
function getV8Overrides({
	compatibilityDate,
	compatibilityFlags,
}: Compatibility): Override {
	const disabledByFlag = compatibilityFlags.includes(
		"disable_nodejs_v8_module"
	);

	const enabledByFlag = compatibilityFlags.includes("enable_nodejs_v8_module");
	const enabledByDate = compatibilityDate >= "2026-03-17";

	const enabled = (enabledByFlag || enabledByDate) && !disabledByFlag;

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
 * - is enabled starting from 2026-03-17
 * - can be enabled with the "enable_nodejs_tty_module" flag
 * - can be disabled with the "disable_nodejs_tty_module" flag
 */
function getTtyOverrides({
	compatibilityDate,
	compatibilityFlags,
}: Compatibility): Override {
	const disabledByFlag = compatibilityFlags.includes(
		"disable_nodejs_tty_module"
	);

	const enabledByFlag = compatibilityFlags.includes("enable_nodejs_tty_module");
	const enabledByDate = compatibilityDate >= "2026-03-17";

	const enabled = (enabledByFlag || enabledByDate) && !disabledByFlag;

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
 * - is enabled starting from 2026-03-17
 * - can be enabled with the "enable_nodejs_child_process_module" flag
 * - can be disabled with the "disable_nodejs_child_process_module" flag
 */
function getChildProcessOverrides({
	compatibilityDate,
	compatibilityFlags,
}: Compatibility): Override {
	const disabledByFlag = compatibilityFlags.includes(
		"disable_nodejs_child_process_module"
	);

	const enabledByFlag = compatibilityFlags.includes(
		"enable_nodejs_child_process_module"
	);
	const enabledByDate = compatibilityDate >= "2026-03-17";

	const enabled = (enabledByFlag || enabledByDate) && !disabledByFlag;

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
 * - is enabled starting from 2026-03-17
 * - can be enabled with the "enable_nodejs_worker_threads_module" flag
 * - can be disabled with the "disable_nodejs_worker_threads_module" flag
 */
function getWorkerThreadsOverrides({
	compatibilityDate,
	compatibilityFlags,
}: Compatibility): Override {
	const disabledByFlag = compatibilityFlags.includes(
		"disable_nodejs_worker_threads_module"
	);

	const enabledByFlag = compatibilityFlags.includes(
		"enable_nodejs_worker_threads_module"
	);
	const enabledByDate = compatibilityDate >= "2026-03-17";

	const enabled = (enabledByFlag || enabledByDate) && !disabledByFlag;

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

/**
 * Returns the overrides for `node:readline` and `node:readline/promises` (unenv or workerd)
 *
 * The native readline implementation:
 * - is enabled starting from 2026-03-17
 * - can be enabled with the "enable_nodejs_readline_module" flag
 * - can be disabled with the "disable_nodejs_readline_module" flag
 */
function getReadlineOverrides({
	compatibilityDate,
	compatibilityFlags,
}: Compatibility): Override {
	const disabledByFlag = compatibilityFlags.includes(
		"disable_nodejs_readline_module"
	);

	const enabledByFlag = compatibilityFlags.includes(
		"enable_nodejs_readline_module"
	);
	const enabledByDate = compatibilityDate >= "2026-03-17";

	const enabled = (enabledByFlag || enabledByDate) && !disabledByFlag;

	// When enabled, use the native `readline` and `readline/promises` modules from workerd
	return enabled
		? {
				nativeModules: ["readline", "readline/promises"],
				hybridModules: [],
			}
		: {
				nativeModules: [],
				hybridModules: [],
			};
}

/**
 * Returns the overrides for `node:perf_hooks` (unenv or workerd)
 *
 * The native performance implementation:
 * - is enabled starting from 2026-03-17
 * - can be enabled with the "enable_nodejs_perf_hooks_module" flag
 * - can be disabled with the "disable_nodejs_perf_hooks_module" flag
 */
function getPerfHooksOverrides({
	compatibilityDate,
	compatibilityFlags,
}: Compatibility): Override {
	const disabledByFlag = compatibilityFlags.includes(
		"disable_nodejs_perf_hooks_module"
	);

	const enabledByFlag = compatibilityFlags.includes(
		"enable_nodejs_perf_hooks_module"
	);
	const enabledByDate = compatibilityDate >= "2026-03-17";

	const enabled = (enabledByFlag || enabledByDate) && !disabledByFlag;

	return enabled
		? {
				nativeModules: ["perf_hooks"],
				hybridModules: [],
			}
		: {
				nativeModules: [],
				hybridModules: [],
				polyfills: ["@cloudflare/unenv-preset/polyfill/performance"],
			};
}

export type Compatibility = {
	/** The compatibility date to be used when computing overrides. */
	compatibilityDate: string;
	/** The compatibility flags to be used when computing overrides. */
	compatibilityFlags: string[];
};

export type Override = {
	/** The native workerd modules that are enabled for the current compat date and flags. */
	nativeModules: string[];
	/** Hybrid modules are provided by unenv but use some native workerd APIs. */
	hybridModules: string[];
	/** The globals that are injected from unenv for the current compat date and flags. */
	inject?: Record<string, string | false>;
	/** The side-effect polyfill modules that are provided from unenv for the current compat date and flags. */
	polyfills?: string[];
};
