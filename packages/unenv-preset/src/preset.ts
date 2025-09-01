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
	"timers",
	"timers/promises",
	"tls",
	"url",
	"util/types",
	"zlib",
];

// Modules implemented via a mix of workerd APIs and polyfills.
const hybridModules = ["console", "process", "util"];

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
	const osOverrides = getOsOverrides(compat);
	const fsOverrides = getFsOverrides(compat);

	// "dynamic" as they depend on the compatibility date and flags
	const dynamicNativeModules = [
		...nativeModules,
		...httpOverrides.nativeModules,
		...osOverrides.nativeModules,
		...fsOverrides.nativeModules,
	];

	// "dynamic" as they depend on the compatibility date and flags
	const dynamicHybridModules = [
		...hybridModules,
		...httpOverrides.hybridModules,
		...osOverrides.hybridModules,
		...fsOverrides.hybridModules,
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

			// The `node:sys` module is just a deprecated alias for `node:util` which we implemented using a hybrid polyfill
			sys: "@cloudflare/unenv-preset/node/util",
			"node:sys": "@cloudflare/unenv-preset/node/util",

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
			console: "@cloudflare/unenv-preset/node/console",
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

	// Override unenv base aliases with native and hybrid modules
	// `node:https` is fully implemented by workerd if both flags are enabled
	return {
		nativeModules: [
			"_http_agent",
			"_http_client",
			"_http_common",
			"_http_incoming",
			"_http_outgoing",
			...(httpServerEnabled ? ["_http_server", "https"] : []),
		],
		hybridModules: httpServerEnabled ? ["http"] : ["http", "https"],
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
