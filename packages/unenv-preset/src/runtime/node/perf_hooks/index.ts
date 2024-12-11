import {
	constants,
	createHistogram,
	monitorEventLoopDelay,
	Performance,
	PerformanceEntry,
	PerformanceMark,
	PerformanceMeasure,
	PerformanceObserver,
	PerformanceObserverEntryList,
	PerformanceResourceTiming,
	performance as unenvPerformance,
} from "unenv/runtime/node/perf_hooks/index";
import type nodePerfHooks from "node:perf_hooks";

export {
	Performance,
	PerformanceEntry,
	PerformanceMark,
	PerformanceMeasure,
	PerformanceObserverEntryList,
	PerformanceObserver,
	PerformanceResourceTiming,
	constants,
	createHistogram,
	monitorEventLoopDelay,
} from "unenv/runtime/node/perf_hooks/index";

// The following is an unusual way to access the original/unpatched globalThis.performance.
// This is needed to get hold of the real performance object before any of the unenv polyfills are
// applied via `inject` or `polyfill` config in presets.
//
// This code relies on the that rollup/esbuild/webpack don't evaluate string concatenation
// so they don't recognize the below as `globalThis.performance` which they would try to rewrite
// into unenv/runtime/node/perf_hooks, thus creating a circular dependency, and breaking this polyfill.
const workerdGlobalPerformance = (globalThis as any)[
	"perf" + "ormance"
] as typeof nodePerfHooks.performance;

// reuse unenv's polyfill, but since preserve globalThis.performance identity
// we use `.bind(unenvPerformance)` here to preserve the `this` for all delegated method calls
export const performance = Object.assign(workerdGlobalPerformance, {
	// @ts-expect-error undocumented public API
	addEventListener: unenvPerformance.addEventListener.bind(unenvPerformance),
	clearMarks: unenvPerformance.clearMarks.bind(unenvPerformance),
	clearMeasures: unenvPerformance.clearMeasures.bind(unenvPerformance),
	clearResourceTimings:
		unenvPerformance.clearResourceTimings.bind(unenvPerformance),
	// @ts-expect-error undocumented public API
	dispatchEvent: unenvPerformance.dispatchEvent.bind(unenvPerformance),
	eventLoopUtilization:
		unenvPerformance.eventLoopUtilization.bind(unenvPerformance),
	getEntries: unenvPerformance.getEntries.bind(unenvPerformance),
	getEntriesByName: unenvPerformance.getEntriesByName.bind(unenvPerformance),
	getEntriesByType: unenvPerformance.getEntriesByType.bind(unenvPerformance),
	mark: unenvPerformance.mark.bind(unenvPerformance),
	markResourceTiming:
		unenvPerformance.markResourceTiming.bind(unenvPerformance),
	measure: unenvPerformance.measure.bind(unenvPerformance),
	nodeTiming: { ...unenvPerformance.nodeTiming },
	onresourcetimingbufferfull:
		// @ts-expect-error undocumented public API
		typeof unenvPerformance.onresourcetimingbufferfull === "function"
			? // @ts-expect-error undocumented public API
				unenvPerformance.onresourcetimingbufferfull.bind(unenvPerformance)
			: // @ts-expect-error undocumented public API
				unenvPerformance.onresourcetimingbufferfull,
	removeEventListener:
		// @ts-expect-error undocumented public API
		unenvPerformance.removeEventListener.bind(unenvPerformance),
	setResourceTimingBufferSize:
		unenvPerformance.setResourceTimingBufferSize.bind(unenvPerformance),
	timerify: unenvPerformance.timerify.bind(unenvPerformance),
	toJSON: unenvPerformance.toJSON.bind(unenvPerformance),
});

export default {
	/**
	 * manually unroll unenv-polyfilled-symbols to make it tree-shakeable
	 */
	Performance,
	PerformanceEntry,
	PerformanceMark,
	PerformanceMeasure,
	// @ts-expect-error TODO: resolve type-mismatch between web and node PerformanceObserverEntryList
	PerformanceObserverEntryList,
	PerformanceObserver,
	// @ts-expect-error TODO: resolve type-mismatch between web and node PerformanceObserverEntryList
	PerformanceResourceTiming,
	constants,
	createHistogram,
	monitorEventLoopDelay,

	/**
	 * manually unroll workerd-polyfilled-symbols to make it tree-shakeable
	 */
	performance,
} satisfies typeof nodePerfHooks;
