import {
	performance,
	Performance,
	PerformanceEntry,
	PerformanceMark,
	PerformanceMeasure,
	PerformanceObserver,
	PerformanceObserverEntryList,
	PerformanceResourceTiming,
} from "unenv/node/perf_hooks";

// `performance` augments the existing workerd implementation
globalThis.performance = performance as Performance;

// Classes not exposes by workerd
// @ts-expect-error unenv type is `unknown`
globalThis.Performance = Performance;
//@ts-expect-error PerformanceEntry constructor from `unenv` doesn't match the one from `node:perf_hooks`
globalThis.PerformanceEntry = PerformanceEntry;
globalThis.PerformanceMark = PerformanceMark;
//@ts-expect-error PerformanceMeasure constructor from `unenv` doesn't match the one from `node:perf_hooks`
globalThis.PerformanceMeasure = PerformanceMeasure;
//@ts-expect-error PerformanceObserver constructor from `unenv` doesn't match the one from `node:perf_hooks`
globalThis.PerformanceObserver = PerformanceObserver;
globalThis.PerformanceObserverEntryList = PerformanceObserverEntryList;
//@ts-expect-error PerformanceResourceTiming constructor from `unenv` doesn't match the one from `node:perf_hooks`
globalThis.PerformanceResourceTiming = PerformanceResourceTiming;
