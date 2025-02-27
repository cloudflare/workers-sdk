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
	"perf_hooks",
	"process",
	"util",
];

export const cloudflare: Preset = {
	meta: {
		name: "unenv:cloudflare",
		version,
		url: __filename,
	},
	alias: {
		...Object.fromEntries(
			nodeCompatModules.flatMap((p) => [
				[p, p],
				[`node:${p}`, `node:${p}`],
			])
		),

		// The `node:sys` module is just a deprecated alias for `node:util` which we implemented using a hybrid polyfill
		sys: "@cloudflare/unenv-preset/node/util",
		"node:sys": "@cloudflare/unenv-preset/node/util",

		// define aliases for hybrid modules
		...Object.fromEntries(
			hybridNodeCompatModules.flatMap((m) => [
				[m, `@cloudflare/unenv-preset/node/${m}`],
				[`node:${m}`, `@cloudflare/unenv-preset/node/${m}`],
			])
		),
	},
	inject: {
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
