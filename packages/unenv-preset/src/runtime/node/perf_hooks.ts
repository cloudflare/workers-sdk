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

//@ts-expect-error Performance is of type `unknown`.
const unenvPerf = new Performance();

function createPropertyDescriptor(prop: string): PropertyDescriptor {
	return {
		get() {
			const unenvValue = unenvPerf[prop];
			if (typeof unenvValue === "function") {
				return unenvValue.bind(unenvPerf);
			}
			return unenvValue[prop];
		},
		set(value: unknown) {
			unenvPerf[prop] = value;
		},
		enumerable: true,
		configurable: true,
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
});

export default {
	/**
	 * manually unroll unenv-polyfilled-symbols to make it tree-shakeable
	 */
	// @ts-expect-error Performance is of type `unknown`
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
	/**
	 * manually unroll workerd-polyfilled-symbols to make it tree-shakeable
	 */
	performance,
} satisfies typeof nodePerfHooks;
