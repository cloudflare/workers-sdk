import {
	performance,
	// Note: `Performance` is only a type in `node:perf_hooks`
	//       But it is a class in the polyfill, see `runtime/node/perf_hooks.ts`
	Performance,
	PerformanceEntry,
	PerformanceMark,
	PerformanceMeasure,
	PerformanceObserver,
	PerformanceObserverEntryList,
	PerformanceResourceTiming,
} from "node:perf_hooks";

// `performance` augments the existing workerd implementation
// @ts-expect-error Node types do not match unenv
globalThis.performance = performance;

// Classes not exposes by workerd
globalThis.Performance = Performance;
// @ts-expect-error Node types do not match unenv
globalThis.PerformanceEntry = PerformanceEntry;
// @ts-expect-error Node types do not match unenv
globalThis.PerformanceMark = PerformanceMark;
// @ts-expect-error Node types do not match unenv
globalThis.PerformanceMeasure = PerformanceMeasure;
// @ts-expect-error Node types do not match unenv
globalThis.PerformanceObserver = PerformanceObserver;
globalThis.PerformanceObserverEntryList = PerformanceObserverEntryList;
// @ts-expect-error Node types do not match unenv
globalThis.PerformanceResourceTiming = PerformanceResourceTiming;
