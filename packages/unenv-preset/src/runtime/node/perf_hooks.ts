import {
	constants,
	createHistogram,
	monitorEventLoopDelay,
	PerformanceEntry,
	PerformanceMark,
	PerformanceMeasure,
	PerformanceObserver,
	PerformanceObserverEntryList,
	PerformanceResourceTiming,
} from "unenv/node/perf_hooks";
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
} from "unenv/node/perf_hooks";

// `unenvPerf` is lazyly instantiated to worakround a circuler dependency.
// `Performance` is undefined at this point.
let unenvPerf: nodePerfHooks.Performance | undefined;

function createPropertyDescriptor<T extends keyof nodePerfHooks.Performance>(
	prop: T
): PropertyDescriptor {
	return {
		get: () => {
			unenvPerf ??= new Performance() as unknown as nodePerfHooks.Performance;
			if (typeof unenvPerf?.[prop] === "function") {
				return unenvPerf[prop].bind(unenvPerf);
			}
			return unenvPerf[prop];
		},
		enumerable: true,
	};
}

export const performance = Object.defineProperties(globalThis.performance, {
	clearMarks: createPropertyDescriptor("clearMarks"),
	clearMeasures: createPropertyDescriptor("clearMeasures"),
	clearResourceTimings: createPropertyDescriptor("clearResourceTimings"),
	eventLoopUtilization: createPropertyDescriptor("eventLoopUtilization"),
	getEntries: createPropertyDescriptor("getEntries"),
	getEntriesByName: createPropertyDescriptor("getEntriesByName"),
	getEntriesByType: createPropertyDescriptor("getEntriesByType"),
	mark: createPropertyDescriptor("mark"),
	markResourceTiming: createPropertyDescriptor("markResourceTiming"),
	measure: createPropertyDescriptor("measure"),
	nodeTiming: createPropertyDescriptor("nodeTiming"),
	setResourceTimingBufferSize: createPropertyDescriptor(
		"setResourceTimingBufferSize"
	),
	timerify: createPropertyDescriptor("timerify"),
	toJSON: createPropertyDescriptor("toJSON"),
}) as unknown as nodePerfHooks.Performance;

// Note, ideally performance should be in the preset `inject`s
//
// 	  inject: {
//      Performance: ["@cloudflare/unenv-preset/node/perf_hooks", "Performance"],
//      performance: ["@cloudflare/unenv-preset/node/perf_hooks", "performance"],
//    }
//
// But does so would create 2 virtual modules with a circular dependency.
// Then we directly assign to `globalThis.performance` at the same time `Performance`
// is injected.
globalThis.performance = performance;

// TODO: resolve type-mismatch between web and node
export default {
	/**
	 * manually unroll unenv-polyfilled-symbols to make it tree-shakeable
	 */
	Performance,
	// @ts-expect-error
	PerformanceEntry,
	PerformanceMark,
	// @ts-expect-error
	PerformanceMeasure,
	// @ts-expect-error
	PerformanceObserverEntryList,
	PerformanceObserver,
	// @ts-expect-error
	PerformanceResourceTiming,
	constants,
	createHistogram,
	monitorEventLoopDelay,
	/**
	 * manually unroll workerd-polyfilled-symbols to make it tree-shakeable
	 */
	performance,
} satisfies typeof nodePerfHooks;
