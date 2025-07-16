import { version } from "../package.json" with { type: "json" };
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

export const cloudflare: Preset = {
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
