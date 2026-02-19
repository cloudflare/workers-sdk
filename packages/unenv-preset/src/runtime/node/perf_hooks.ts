import {
	IntervalHistogram,
	RecordableHistogram,
} from "unenv/node/internal/perf_hooks/histogram";
import {
	Performance,
	performance,
	PerformanceEntry,
	PerformanceMark,
	PerformanceMeasure,
	PerformanceObserver,
	PerformanceObserverEntryList,
	PerformanceResourceTiming,
} from "./internal/performance";
import type nodePerfHooks from "node:perf_hooks";
// prettier-ignore
import { NODE_PERFORMANCE_GC_MAJOR, NODE_PERFORMANCE_GC_MINOR, NODE_PERFORMANCE_GC_INCREMENTAL, NODE_PERFORMANCE_GC_WEAKCB, NODE_PERFORMANCE_GC_FLAGS_NO, NODE_PERFORMANCE_GC_FLAGS_CONSTRUCT_RETAINED, NODE_PERFORMANCE_GC_FLAGS_FORCED, NODE_PERFORMANCE_GC_FLAGS_SYNCHRONOUS_PHANTOM_PROCESSING, NODE_PERFORMANCE_GC_FLAGS_ALL_AVAILABLE_GARBAGE, NODE_PERFORMANCE_GC_FLAGS_ALL_EXTERNAL_MEMORY, NODE_PERFORMANCE_GC_FLAGS_SCHEDULE_IDLE, NODE_PERFORMANCE_ENTRY_TYPE_GC, NODE_PERFORMANCE_ENTRY_TYPE_HTTP, NODE_PERFORMANCE_ENTRY_TYPE_HTTP2, NODE_PERFORMANCE_ENTRY_TYPE_NET, NODE_PERFORMANCE_ENTRY_TYPE_DNS, NODE_PERFORMANCE_MILESTONE_TIME_ORIGIN_TIMESTAMP, NODE_PERFORMANCE_MILESTONE_TIME_ORIGIN, NODE_PERFORMANCE_MILESTONE_ENVIRONMENT, NODE_PERFORMANCE_MILESTONE_NODE_START, NODE_PERFORMANCE_MILESTONE_V8_START, NODE_PERFORMANCE_MILESTONE_LOOP_START, NODE_PERFORMANCE_MILESTONE_LOOP_EXIT, NODE_PERFORMANCE_MILESTONE_BOOTSTRAP_COMPLETE } from "unenv/node/internal/perf_hooks/constants";

export * from "./internal/performance";

// prettier-ignore
export const constants = {
  NODE_PERFORMANCE_GC_MAJOR, NODE_PERFORMANCE_GC_MINOR, NODE_PERFORMANCE_GC_INCREMENTAL, NODE_PERFORMANCE_GC_WEAKCB, NODE_PERFORMANCE_GC_FLAGS_NO, NODE_PERFORMANCE_GC_FLAGS_CONSTRUCT_RETAINED, NODE_PERFORMANCE_GC_FLAGS_FORCED, NODE_PERFORMANCE_GC_FLAGS_SYNCHRONOUS_PHANTOM_PROCESSING, NODE_PERFORMANCE_GC_FLAGS_ALL_AVAILABLE_GARBAGE, NODE_PERFORMANCE_GC_FLAGS_ALL_EXTERNAL_MEMORY, NODE_PERFORMANCE_GC_FLAGS_SCHEDULE_IDLE, NODE_PERFORMANCE_ENTRY_TYPE_GC, NODE_PERFORMANCE_ENTRY_TYPE_HTTP, NODE_PERFORMANCE_ENTRY_TYPE_HTTP2, NODE_PERFORMANCE_ENTRY_TYPE_NET, NODE_PERFORMANCE_ENTRY_TYPE_DNS, NODE_PERFORMANCE_MILESTONE_TIME_ORIGIN_TIMESTAMP, NODE_PERFORMANCE_MILESTONE_TIME_ORIGIN, NODE_PERFORMANCE_MILESTONE_ENVIRONMENT, NODE_PERFORMANCE_MILESTONE_NODE_START, NODE_PERFORMANCE_MILESTONE_V8_START, NODE_PERFORMANCE_MILESTONE_LOOP_START, NODE_PERFORMANCE_MILESTONE_LOOP_EXIT, NODE_PERFORMANCE_MILESTONE_BOOTSTRAP_COMPLETE
} as unknown as typeof nodePerfHooks.constants;

export const monitorEventLoopDelay: typeof nodePerfHooks.monitorEventLoopDelay =
	function (_options) {
		return new IntervalHistogram();
	};

export const createHistogram: typeof nodePerfHooks.createHistogram = function (
	_options
) {
	return new RecordableHistogram();
};

export default {
	Performance,
	PerformanceMark,
	PerformanceEntry,
	PerformanceMeasure,
	PerformanceObserverEntryList,
	PerformanceObserver,
	PerformanceResourceTiming,
	performance,
	constants,
	createHistogram,
	monitorEventLoopDelay,
} satisfies {
	// @types/node bug: Performance is a class in the runtime but only an interface in the types
	Performance: typeof Performance;
} & Omit<
	typeof nodePerfHooks,
	// @types/node bug: PerformanceNodeTiming is included in the types but doesn't exist in the runtime
	"PerformanceNodeTiming"
>;
