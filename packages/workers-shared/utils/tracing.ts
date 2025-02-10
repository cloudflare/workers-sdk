import type { JaegerTracing, Span } from "./types";

export function mockJaegerBindingSpan(): Span {
	return {
		addLogs: () => {},
		setTags: () => {},
		end: () => {},
		isRecording: true,
	};
}

export function mockJaegerBinding(): JaegerTracing {
	return {
		enterSpan: (_, span, ...args) => {
			return span(mockJaegerBindingSpan(), ...args);
		},
		getSpanContext: () => ({
			traceId: "test-trace",
			spanId: "test-span",
			parentSpanId: "test-parent-span",
			traceFlags: 0,
		}),
		runWithSpanContext: (_, callback, ...args) => {
			return callback(...args);
		},

		traceId: "test-trace",
		spanId: "test-span",
		parentSpanId: "test-parent-span",
		cfTraceIdHeader: "test-trace:test-span:0",
	};
}
