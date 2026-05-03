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

// When native perf_hooks is disabled but workerd provides a web-standard
// globalThis.performance (with addEventListener), unenv's polyfill defers to
// the native object instead of creating a new Performance() instance.
// This means Node.js-specific properties like nodeTiming are missing.
// Detect this case and augment the object with the missing polyfill properties.
if (!("__unenv__" in performance)) {
	const proto = Performance.prototype;
	for (const key of Object.getOwnPropertyNames(proto)) {
		if (key !== "constructor" && !(key in performance)) {
			const desc = Object.getOwnPropertyDescriptor(proto, key);
			if (desc) {
				Object.defineProperty(performance, key, desc);
			}
		}
	}
}

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
