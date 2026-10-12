/** A span as written by the collector (attributes still a plain object). */
export interface SpanInput {
	traceId: string;
	spanId: string;
	parentId: string | null;
	/** Owning worker (service) name, for multi-worker attribution/filtering. */
	service: string | null;
	name: string | null;
	kind: string | null;
	startMs: number;
	/** Null while the span is still open. */
	durationMs: number | null;
	outcome: string | null;
	error: string | null;
	attributes: Record<string, unknown> | null;
}

/** Fields set when a span closes. */
export interface SpanClose {
	durationMs: number;
	outcome: string | null;
	error: string | null;
	/** Final attributes merged in at close (e.g. status code, cpu/wall time). */
	attributes: Record<string, unknown> | null;
}

/** A serialized log record awaiting a store-owned sequence number. */
export interface LogInput {
	traceId: string;
	spanId: string | null;
	tsMs: number;
	level: string;
	message: string;
	operation: string | null;
}
