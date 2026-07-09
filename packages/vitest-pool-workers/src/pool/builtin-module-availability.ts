// Node.js builtin modules that `workerd` only serves natively behind a
// compatibility flag/date, and for which the pool provides NO polyfill or
// injected fallback. When such a module is gated OFF for the worker's
// compatibility settings, `workerd` has no builtin to serve, so redirecting the
// module fallback request to `/node:<module>` crashes the runtime (SIGSEGV).
// For these we must instead report the module as unavailable so the fallback
// service returns a clean "No such module" error.
//
// The (enableFlag, disableFlag, defaultOnDate) triples below are derived from
// the authoritative source `packages/unenv-preset/src/preset.ts` — one entry
// per `get*Overrides()` helper whose disabled branch has no hybrid module or
// polyfill (i.e. no JS fallback the pool can resolve instead of the native
// builtin). Modules that DO have a fallback are intentionally omitted so they
// keep resolving:
//   - console, vm            -> injected directly into the worker bundle by the
//                               pool (see pool/index.ts `node:console`/`node:vm`),
//                               so they never reach the fallback service.
//   - process, perf_hooks    -> hybrid/polyfill fallback AND force-enabled by
//                               the pool via `ensureFeature` (process_v2 /
//                               perf_hooks).
//   - http/https/_http_*, fs -> force-enabled by the pool via `ensureFeature`
//                               (http_modules / fs), so always available. The
//                               ONE exception is `_http_server`: `getHttpOverrides`
//                               puts it behind a SECOND sub-gate
//                               (enable_nodejs_http_server_modules / 2025-09-01)
//                               that the pool does NOT force-enable, so it is a
//                               native-only gated module and IS listed below.
// Modules force-enabled by `ensureFeature` (tty, v8, and the above) still get
// their real preset entry here where applicable (tty, v8): the injected
// `enable_*` flag makes `createBuiltinModuleAvailability` return `true`, matching
// the pool's intent to always expose them.
//
// This table manually mirrors `preset.ts`. The drift guard in
// `test/builtin-module-availability.test.ts` asserts, against the exported
// `getCloudflarePreset`, that every entry's flags and date still match the
// preset and that no newly gated native-only module is missing — so a future
// `preset.ts` change that would silently reintroduce the segfault fails CI.
export type GatedNodeBuiltinModule = {
	enableFlag: string;
	disableFlag: string;
	defaultOnDate: string;
};

export const gatedNodeBuiltinModules = new Map<string, GatedNodeBuiltinModule>([
	// preset.ts getOsOverrides: enabled from 2025-09-15
	[
		"node:os",
		{
			defaultOnDate: "2025-09-15",
			disableFlag: "disable_nodejs_os_module",
			enableFlag: "enable_nodejs_os_module",
		},
	],
	// preset.ts getHttp2Overrides: enabled from 2025-09-01
	[
		"node:http2",
		{
			defaultOnDate: "2025-09-01",
			disableFlag: "disable_nodejs_http2_module",
			enableFlag: "enable_nodejs_http2_module",
		},
	],
	// preset.ts getHttpOverrides http-server sub-gate: `_http_server` is only
	// native when the server gate is on (enabled from 2025-09-01). The pool
	// force-enables `nodejs_http_modules` but NOT this server gate, so this is
	// the one `_http_*` module that stays gated (preset.ts:167-191).
	[
		"node:_http_server",
		{
			defaultOnDate: "2025-09-01",
			disableFlag: "disable_nodejs_http_server_modules",
			enableFlag: "enable_nodejs_http_server_modules",
		},
	],
	// preset.ts getPunycodeOverrides: enabled from 2025-12-04
	[
		"node:punycode",
		{
			defaultOnDate: "2025-12-04",
			disableFlag: "disable_nodejs_punycode_module",
			enableFlag: "enable_nodejs_punycode_module",
		},
	],
	// preset.ts getClusterOverrides: enabled from 2025-12-04
	[
		"node:cluster",
		{
			defaultOnDate: "2025-12-04",
			disableFlag: "disable_nodejs_cluster_module",
			enableFlag: "enable_nodejs_cluster_module",
		},
	],
	// preset.ts getTraceEventsOverrides: enabled from 2025-12-04
	[
		"node:trace_events",
		{
			defaultOnDate: "2025-12-04",
			disableFlag: "disable_nodejs_trace_events_module",
			enableFlag: "enable_nodejs_trace_events_module",
		},
	],
	// preset.ts getDomainOverrides: enabled from 2025-12-04
	[
		"node:domain",
		{
			defaultOnDate: "2025-12-04",
			disableFlag: "disable_nodejs_domain_module",
			enableFlag: "enable_nodejs_domain_module",
		},
	],
	// preset.ts getWasiOverrides: enabled from 2025-12-04
	[
		"node:wasi",
		{
			defaultOnDate: "2025-12-04",
			disableFlag: "disable_nodejs_wasi_module",
			enableFlag: "enable_nodejs_wasi_module",
		},
	],
	// preset.ts getInspectorOverrides: enabled from 2026-01-29 (inspector + inspector/promises)
	[
		"node:inspector",
		{
			defaultOnDate: "2026-01-29",
			disableFlag: "disable_nodejs_inspector_module",
			enableFlag: "enable_nodejs_inspector_module",
		},
	],
	[
		"node:inspector/promises",
		{
			defaultOnDate: "2026-01-29",
			disableFlag: "disable_nodejs_inspector_module",
			enableFlag: "enable_nodejs_inspector_module",
		},
	],
	// preset.ts getSqliteOverrides: enabled from 2026-01-29
	[
		"node:sqlite",
		{
			defaultOnDate: "2026-01-29",
			disableFlag: "disable_nodejs_sqlite_module",
			enableFlag: "enable_nodejs_sqlite_module",
		},
	],
	// preset.ts getDgramOverrides: enabled from 2026-01-29
	[
		"node:dgram",
		{
			defaultOnDate: "2026-01-29",
			disableFlag: "disable_nodejs_dgram_module",
			enableFlag: "enable_nodejs_dgram_module",
		},
	],
	// preset.ts getStreamWrapOverrides: enabled from 2026-01-29
	[
		"node:_stream_wrap",
		{
			defaultOnDate: "2026-01-29",
			disableFlag: "disable_nodejs_stream_wrap_module",
			enableFlag: "enable_nodejs_stream_wrap_module",
		},
	],
	// preset.ts getReplOverrides: enabled from 2026-03-17
	[
		"node:repl",
		{
			defaultOnDate: "2026-03-17",
			disableFlag: "disable_nodejs_repl_module",
			enableFlag: "enable_nodejs_repl_module",
		},
	],
	// preset.ts getV8Overrides: enabled from 2026-03-17 (force-enabled by ensureFeature)
	[
		"node:v8",
		{
			defaultOnDate: "2026-03-17",
			disableFlag: "disable_nodejs_v8_module",
			enableFlag: "enable_nodejs_v8_module",
		},
	],
	// preset.ts getTtyOverrides: enabled from 2026-03-17 (force-enabled by ensureFeature)
	[
		"node:tty",
		{
			defaultOnDate: "2026-03-17",
			disableFlag: "disable_nodejs_tty_module",
			enableFlag: "enable_nodejs_tty_module",
		},
	],
	// preset.ts getChildProcessOverrides: enabled from 2026-03-17
	[
		"node:child_process",
		{
			defaultOnDate: "2026-03-17",
			disableFlag: "disable_nodejs_child_process_module",
			enableFlag: "enable_nodejs_child_process_module",
		},
	],
	// preset.ts getWorkerThreadsOverrides: enabled from 2026-03-17
	[
		"node:worker_threads",
		{
			defaultOnDate: "2026-03-17",
			disableFlag: "disable_nodejs_worker_threads_module",
			enableFlag: "enable_nodejs_worker_threads_module",
		},
	],
	// preset.ts getReadlineOverrides: enabled from 2026-03-17 (readline + readline/promises)
	[
		"node:readline",
		{
			defaultOnDate: "2026-03-17",
			disableFlag: "disable_nodejs_readline_module",
			enableFlag: "enable_nodejs_readline_module",
		},
	],
	[
		"node:readline/promises",
		{
			defaultOnDate: "2026-03-17",
			disableFlag: "disable_nodejs_readline_module",
			enableFlag: "enable_nodejs_readline_module",
		},
	],
]);

export type BuiltinModuleAvailability = (specifier: string) => boolean;

export const builtinModulesAlwaysEnabled: BuiltinModuleAvailability = () =>
	true;

export function createBuiltinModuleAvailability(
	compatibilityDate: string,
	compatibilityFlags: readonly string[]
): BuiltinModuleAvailability {
	return (specifier) => {
		const gatedModule = gatedNodeBuiltinModules.get(specifier);
		if (gatedModule === undefined) {
			return true;
		}
		if (compatibilityFlags.includes(gatedModule.disableFlag)) {
			return false;
		}
		return (
			compatibilityFlags.includes(gatedModule.enableFlag) ||
			compatibilityDate >= gatedModule.defaultOnDate
		);
	};
}
