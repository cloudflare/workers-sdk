import { version } from "../package.json";
import type { Preset } from "unenv";

// Built-in APIs provided by workerd.
//
// https://developers.cloudflare.com/workers/runtime-apis/nodejs/
// https://github.com/cloudflare/workerd/tree/main/src/node
//
// Last checked: 2025-01-24
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
	"diagnostics_channel",
	"dns",
	"dns/promises",
	"events",
	"net",
	"path",
	"path/posix",
	"path/win32",
	"querystring",
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
const hybridModules = ["console", "crypto", "module", "process", "util"];

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
	const httpOverrides = getHttpOverrides({
		compatibilityDate,
		compatibilityFlags,
	});

	const osOverrides = getOsOverrides({
		compatibilityDate,
		compatibilityFlags,
	});

	// "dynamic" as they depend on the compatibility date and flags
	const dynamicNativeModules = [
		...nativeModules,
		...httpOverrides.nativeModules,
		...osOverrides.nativeModules,
	];

	// "dynamic" as they depend on the compatibility date and flags
	const dynamicHybridModules = [
		...hybridModules,
		...httpOverrides.hybridModules,
		...osOverrides.hybridModules,
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
 * - is enabled after 2025-08-15
 * - can be enabled with the "enable_nodejs_http_modules" flag
 * - can be disabled with the "disable_nodejs_http_modules" flag
 *
 * The native http server APIS implementation:
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

	const httpServerEnabledByFlag =
		compatibilityFlags.includes("enable_nodejs_http_server_modules") &&
		compatibilityFlags.includes("experimental");

	const httpServerDisabledByFlag = compatibilityFlags.includes(
		"disable_nodejs_http_server_modules"
	);

	// Note that `httpServerEnabled` requires `httpEnabled`
	// TODO: add `httpServerEnabledByDate` when a default date is set
	const httpServerEnabled =
		httpServerEnabledByFlag && !httpServerDisabledByFlag;

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
 * The native http implementation:
 * - can be enabled with the "enable_nodejs_os_module" flag
 * - can be disabled with the "disable_nodejs_os_module" flag
 */
function getOsOverrides({
	// eslint-disable-next-line unused-imports/no-unused-vars
	compatibilityDate,
	compatibilityFlags,
}: {
	compatibilityDate: string;
	compatibilityFlags: string[];
}): { nativeModules: string[]; hybridModules: string[] } {
	const disabledByFlag = compatibilityFlags.includes(
		"disable_nodejs_os_module"
	);

	const enabledByFlag =
		compatibilityFlags.includes("enable_nodejs_os_module") &&
		compatibilityFlags.includes("experimental");

	// TODO: add `enabledByDate` when a default date is set
	const enabled = enabledByFlag && !disabledByFlag;

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
