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
const nodeCompatModules = [
	"_stream_duplex",
	"_stream_passthrough",
	"_stream_readable",
	"_stream_transform",
	"_stream_writable",
	"_tls_common",
	"_tls_wrap",
	"assert",
	"assert/strict",
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
	"url",
	"util/types",
	"zlib",
];

// Modules implemented via a mix of workerd APIs and polyfills.
const hybridNodeCompatModules = [
	"async_hooks",
	"console",
	"crypto",
	"module",
	"process",
	"tls",
	"util",
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
				nodeCompatModules.flatMap((p) => [
					[p, p],
					[`node:${p}`, `node:${p}`],
				])
			),

			// The `node:sys` module is just a deprecated alias for `node:util` which we implemented using a hybrid polyfill
			sys: "@cloudflare/unenv-preset/node/util",
			"node:sys": "@cloudflare/unenv-preset/node/util",

			// `hybridNodeCompatModules` are implemented by the cloudflare preset.
			...Object.fromEntries(
				hybridNodeCompatModules.flatMap((m) => [
					[m, `@cloudflare/unenv-preset/node/${m}`],
					[`node:${m}`, `@cloudflare/unenv-preset/node/${m}`],
				])
			),

			// Use either the unenv or native implementation
			...getHttpAliases({ compatibilityDate, compatibilityFlags }),

			// To override the npm shim from unenv
			debug: "@cloudflare/unenv-preset/npm/debug",
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
		external: nodeCompatModules.flatMap((p) => [p, `node:${p}`]),
	};
}

/**
 * Returns the aliases for node http modules (unenv or workerd)
 *
 * The native implementation:
 * - is enabled after 2025-08-15
 * - can be enabled with the "enable_nodejs_http_modules" flag
 * - can be disabled with the "disable_nodejs_http_modules" flag
 */
function getHttpAliases({
	compatibilityDate,
	compatibilityFlags,
}: {
	compatibilityDate: string;
	compatibilityFlags: string[];
}): Record<string, string> {
	const disabledByFlag = compatibilityFlags.includes(
		"disable_nodejs_http_modules"
	);
	const enabledByFlags = compatibilityFlags.includes(
		"enable_nodejs_http_modules"
	);
	const enabledByDate = compatibilityDate >= "2025-08-15";

	const enabled = (enabledByFlags || enabledByDate) && !disabledByFlag;

	if (!enabled) {
		// use the unenv polyfill
		return {};
	}

	const aliases: Record<string, string> = {};

	// Override the unenv base aliases to use the native modules
	const nativeModules = [
		"_http_common",
		"_http_outgoing",
		"_http_client",
		"_http_incoming",
		"_http_agent",
	];

	for (const nativeModule of nativeModules) {
		aliases[nativeModule] = nativeModule;
		aliases[`node:${nativeModule}`] = `node:${nativeModule}`;
	}

	// Override the unenv base aliases to use the hybrid polyfills
	const hybridModules = ["http", "https"];

	for (const hybridModule of hybridModules) {
		aliases[hybridModule] = `@cloudflare/unenv-preset/node/${hybridModule}`;
		aliases[`node:${hybridModule}`] =
			`@cloudflare/unenv-preset/node/${hybridModule}`;
	}

	return aliases;
}
