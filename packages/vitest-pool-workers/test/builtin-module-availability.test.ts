import { getCloudflarePreset } from "@cloudflare/unenv-preset";
import { describe, it } from "vitest";
import {
	createBuiltinModuleAvailability,
	gatedNodeBuiltinModules,
} from "../src/pool/builtin-module-availability";

// The pool hand-mirrors a subset of `@cloudflare/unenv-preset`'s gating rules in
// `gatedNodeBuiltinModules` to decide which `node:*` builtins are safe to
// redirect to workerd's native module (redirecting a gated-off native-only
// builtin crashes workerd with SIGSEGV). This suite pins that table to the live
// preset so a future `preset.ts` change to a flag name or default-on date fails
// CI instead of silently reintroducing the crash.

// `getCloudflarePreset` lists every natively-served builtin (with and without
// the `node:` prefix) in `external`. A `node:*` specifier is served natively by
// workerd for the given config iff it appears there.
function isNativeInPreset(
	specifier: string,
	compatibilityDate: string,
	compatibilityFlags: string[]
): boolean {
	const preset = getCloudflarePreset({ compatibilityDate, compatibilityFlags });
	return new Set(preset.external).has(specifier);
}

function dayBefore(isoDate: string): string {
	const date = new Date(`${isoDate}T00:00:00Z`);
	date.setUTCDate(date.getUTCDate() - 1);
	return date.toISOString().slice(0, 10);
}

describe("gatedNodeBuiltinModules drift guard", () => {
	describe("each entry matches the preset at its boundaries", () => {
		for (const [specifier, gate] of gatedNodeBuiltinModules) {
			it(`${specifier}`, ({ expect }) => {
				const before = dayBefore(gate.defaultOnDate);

				// Each boundary encodes what the map claims about this module. If the
				// map's date or a flag name drifts from `preset.ts`, the preset result
				// stops matching the expected value below.
				const boundaries = [
					// Native on the default-on date with no flags.
					{
						date: gate.defaultOnDate,
						flags: [] as string[],
						expected: true,
					},
					// Not native the day before the default-on date.
					{ date: before, flags: [], expected: false },
					// The enable flag turns it on before the default-on date.
					{ date: before, flags: [gate.enableFlag], expected: true },
					// The disable flag turns it off on the default-on date.
					{
						date: gate.defaultOnDate,
						flags: [gate.disableFlag],
						expected: false,
					},
				];

				for (const boundary of boundaries) {
					const presetNative = isNativeInPreset(
						specifier,
						boundary.date,
						boundary.flags
					);
					// The preset gates this module exactly as the map claims.
					expect(
						presetNative,
						`preset native for ${specifier} at ${boundary.date} with [${boundary.flags.join(", ")}]`
					).toBe(boundary.expected);
					// The availability function the pool actually ships tracks the preset.
					const available = createBuiltinModuleAvailability(
						boundary.date,
						boundary.flags
					)(specifier);
					expect(
						available,
						`createBuiltinModuleAvailability for ${specifier} at ${boundary.date} with [${boundary.flags.join(", ")}]`
					).toBe(presetNative);
				}
			});
		}
	});

	it("covers every native-only gated builtin the preset can crash on", ({
		expect,
	}) => {
		// Modules the pool force-enables (via `ensureFeature` in pool/index.ts) or
		// injects directly into the worker bundle are always available, so they
		// never reach the fallback service as an ungated native redirect and are
		// intentionally excluded from the map (`node:tty`/`node:v8` are also
		// force-enabled but kept in the map defensively — a safe superset).
		const poolGuaranteed = new Set([
			// ensureFeature(nodejs_fs_module)
			"node:fs",
			"node:fs/promises",
			// ensureFeature(nodejs_http_modules) — the http server sub-gate is NOT
			// force-enabled, so `node:_http_server` stays gated and is in the map.
			"node:http",
			"node:https",
			"node:_http_agent",
			"node:_http_client",
			"node:_http_common",
			"node:_http_incoming",
			"node:_http_outgoing",
			// ensureFeature(nodejs_perf_hooks_module)
			"node:perf_hooks",
			// ensureFeature(nodejs_process_v2)
			"node:process",
			// ensureFeature(nodejs_tty_module) / ensureFeature(nodejs_v8_module)
			"node:tty",
			"node:v8",
			// injected into the worker bundle by pool/index.ts
			"node:console",
			"node:vm",
		]);

		// A builtin is "native-only gated" when the preset serves it natively at a
		// late date but neither natively nor via a hybrid polyfill at an early
		// date — i.e. gated off leaves no JS fallback and redirecting crashes
		// workerd. Derive that set directly from the preset.
		const earlyDate = "2020-01-01";
		const lateDate = "2100-01-01";
		const early = getCloudflarePreset({
			compatibilityDate: earlyDate,
			compatibilityFlags: [],
		});
		const late = getCloudflarePreset({
			compatibilityDate: lateDate,
			compatibilityFlags: [],
		});
		const nativeEarly = new Set(early.external);
		const nativeLate = new Set(late.external);

		const nativeOnlyGated = [...nativeLate]
			.filter((specifier) => specifier.startsWith("node:"))
			.filter((specifier) => !nativeEarly.has(specifier))
			.filter((specifier) => {
				// A hybrid module aliases `node:x` to a polyfill implementation rather
				// than to itself, so it still resolves when gated off.
				const alias = early.alias?.[specifier];
				return alias === undefined || alias === specifier;
			});
		const nativeOnlyGatedSet = new Set(nativeOnlyGated);
		const mapKeys = new Set(gatedNodeBuiltinModules.keys());

		// No native-only gated builtin can be missing from the map unless the pool
		// guarantees it some other way — otherwise it would crash workerd again.
		const missing = [...nativeOnlyGatedSet].filter(
			(specifier) => !mapKeys.has(specifier) && !poolGuaranteed.has(specifier)
		);
		expect(missing, "native-only gated builtins missing from the map").toEqual(
			[]
		);

		// No map entry should be a module the preset actually polyfills — that
		// would be a dead entry that needlessly blocks a resolvable module.
		const bogus = [...mapKeys].filter(
			(specifier) => !nativeOnlyGatedSet.has(specifier)
		);
		expect(bogus, "map entries the preset does not gate native-only").toEqual(
			[]
		);
	});
});
