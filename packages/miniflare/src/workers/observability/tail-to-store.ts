/**
 * TailStream → TraceStore mapping (local dev, no OpenTelemetry).
 *
 * Folds one invocation's workerd streaming-tail events straight into the store's
 * `SpanInput` / `LogInput` shape. Capture is *write-through*: a span is opened
 * (duration NULL = still running) the moment it starts, its attributes are
 * merged as they stream in, and it is finalised when it closes — so long-running
 * work (agents, waits, streamed responses) shows up in the UI in-flight instead
 * of appearing only once the whole invocation ends. This is the whole capture
 * path — there is no intermediate OpenTelemetry object model.
 *
 * Why no OTEL: OTLP compliance buys interop with a real backend (matching the
 * production wire format). Local dev owns both the producer and the consumer, so
 * that compliance is dead weight. We keep the *attribute conventions* the
 * Workers Observability UI reads (`faas.trigger`, `http.request.method`,
 * `http.response.status_code`, `cloudflare.outcome`, `cpu_time_ms`, …) and drop
 * the SDK/transport entirely. No redaction: local dev URLs/headers are the
 * developer's own, so there is nothing to protect against here.
 */
import type { LogInput, SpanClose, SpanInput } from "./trace-store";

/** The write-through subset of the TraceStore the handler drives (the DO stub
 * satisfies this; RPC methods resolve to promises). */
interface WriteThroughStore {
	openSpan(s: SpanInput): void | Promise<void>;
	mergeAttributes(
		traceId: string,
		spanId: string,
		attributes: Record<string, unknown>
	): void | Promise<void>;
	closeSpan(
		traceId: string,
		spanId: string,
		close: SpanClose
	): void | Promise<void>;
	appendLog(log: LogInput): void | Promise<void>;
}

/** A tail event's `timestamp` is a `Date` (or ms number); normalise to epoch ms. */
function toMs(timestamp: Date | number): number {
	return typeof timestamp === "number" ? timestamp : timestamp.getTime();
}

/**
 * The span context for an event. For `onset` / `spanOpen` the new span's id is on
 * the event; `spanContext.spanId` is then its parent. For every other event the
 * `spanContext` already points at the span the event acts on.
 */
function ids(
	// A generic tail event — the concrete event type is narrowed by callers.
	event: TailStream.TailEvent<TailStream.EventType>
): { traceId: string; spanId?: string; parentId?: string } {
	if (event.event.type === "onset" || event.event.type === "spanOpen") {
		return {
			traceId: event.spanContext.traceId,
			spanId: event.event.spanId,
			parentId: event.spanContext.spanId,
		};
	}
	return {
		traceId: event.spanContext.traceId,
		spanId: event.spanContext.spanId,
	};
}

/** Friendly `kind` for the UI: root span from its trigger, children from name. */
function friendlyKind(faasTrigger: string | undefined, name: string): string {
	if (faasTrigger) {
		switch (faasTrigger) {
			case "http":
				return "http";
			case "timer":
				return "scheduled";
			case "pubsub":
				return "queue";
			case "email":
				return "email";
			case "jsrpc":
				return "jsrpc";
			case "websocket":
				return "websocket";
			case "trace":
				return "trace";
			default:
				return "worker";
		}
	}
	const n = name.toLowerCase();
	if (n.includes("kv")) {
		return "kv";
	}
	if (n.includes("d1")) {
		return "d1";
	}
	if (n.includes("r2")) {
		return "r2";
	}
	if (n.includes("queue")) {
		return "queue";
	}
	if (n.includes("durable") || n.includes("do_")) {
		return "do";
	}
	if (n.includes("cache")) {
		return "cache";
	}
	if (n.includes("fetch")) {
		return "fetch";
	}
	return "span";
}

/** Root-span name + attributes derived from the onset trigger info. */
function describeTrigger(info: TailStream.Onset["info"]): {
	name: string;
	attributes: Record<string, unknown>;
} {
	switch (info.type) {
		case "fetch":
			return {
				name: info.method,
				attributes: {
					"faas.trigger": "http",
					"http.request.method": info.method,
					"url.full": info.url,
				},
			};
		case "jsrpc":
			return { name: "jsrpc", attributes: { "faas.trigger": "jsrpc" } };
		case "scheduled":
			return {
				name: "scheduled",
				attributes: { "faas.trigger": "timer", "faas.cron": info.cron },
			};
		case "alarm":
			return { name: "alarm", attributes: { "faas.trigger": "timer" } };
		case "queue":
			return {
				name: "queue",
				attributes: {
					"faas.trigger": "pubsub",
					"cloudflare.queue.name": info.queueName,
				},
			};
		case "email":
			return {
				name: "email",
				attributes: {
					"faas.trigger": "email",
					"cloudflare.email.to": info.rcptTo,
				},
			};
		case "trace":
			return { name: "trace", attributes: { "faas.trigger": "trace" } };
		case "hibernatableWebSocket":
			return {
				name: "hibernatableWebSocket",
				attributes: { "faas.trigger": "websocket" },
			};
		default:
			return { name: info.type, attributes: { "faas.trigger": "other" } };
	}
}

const ERROR_OUTCOMES = new Set([
	"canceled",
	"exception",
	"unknown",
	"killSwitch",
	"daemonDown",
	"exceededCpu",
	"exceededMemory",
	"loadShed",
	"responseStreamDisconnected",
	"scriptNotFound",
]);

/**
 * Per-span bookkeeping kept between events so we can compute a duration and fold
 * in error info when the span closes. Attributes are written straight through to
 * the store (not buffered here), so this holds only what `closeSpan` needs.
 */
interface PendingSpan {
	traceId: string;
	startMs: number;
	name: string | null;
	outcome: string | null;
	error: string | null;
	errored: boolean;
	closed: boolean;
}

/**
 * Streaming-tail handler for one invocation. Writes each span through to the
 * store as it happens — opened when it starts, attributes merged as they arrive,
 * finalised when it closes — so the UI can render still-running spans. All store
 * writes are dispatched immediately (delivery to the DO is ordered by call order)
 * and awaited at `outcome` so nothing is lost when the invocation ends.
 */
export class TailToStoreHandler implements TailStream.TailEventHandlerObject {
	#spans = new Map<string, PendingSpan>();
	#rootSpanId: string | null = null;
	#traceId: string | null = null;
	#startMs: number | null = null;
	#invocationBody: string | null = null;
	#writes: Promise<unknown>[] = [];

	constructor(
		private readonly store: WriteThroughStore,
		onset: TailStream.TailEvent<TailStream.Onset>
	) {
		const { traceId, spanId } = ids(onset);
		if (!spanId) {
			return;
		}
		this.#rootSpanId = spanId;
		this.#traceId = traceId;
		this.#startMs = toMs(onset.timestamp);

		const { name, attributes } = describeTrigger(onset.event.info);
		if (onset.invocationId) {
			attributes["faas.invocation_id"] = onset.invocationId;
		}
		// Invocation-log body: for fetch, method + URL (mirrors the prod Logs view);
		// otherwise the trigger name.
		this.#invocationBody =
			onset.event.info.type === "fetch"
				? `${onset.event.info.method} ${onset.event.info.url}`
				: name;
		this.#spans.set(spanId, {
			traceId,
			startMs: this.#startMs,
			name,
			outcome: null,
			error: null,
			errored: false,
			closed: false,
		});
		this.#open({
			traceId,
			spanId,
			parentId: null,
			name,
			kind: friendlyKind(attributes["faas.trigger"] as string, name),
			startMs: this.#startMs,
			durationMs: null,
			outcome: null,
			error: null,
			attributes,
		});
	}

	spanOpen(event: TailStream.TailEvent<TailStream.SpanOpen>) {
		const { traceId, spanId, parentId } = ids(event);
		if (!spanId) {
			return;
		}
		const startMs = toMs(event.timestamp);
		this.#spans.set(spanId, {
			traceId,
			startMs,
			name: event.event.name,
			outcome: null,
			error: null,
			errored: false,
			closed: false,
		});
		this.#open({
			traceId,
			spanId,
			parentId: parentId ?? null,
			name: event.event.name,
			kind: friendlyKind(undefined, event.event.name),
			startMs,
			durationMs: null,
			outcome: null,
			error: null,
			attributes: null,
		});
	}

	spanClose(event: TailStream.TailEvent<TailStream.SpanClose>) {
		const { traceId, spanId } = ids(event);
		const pending = spanId ? this.#spans.get(spanId) : undefined;
		if (spanId && pending) {
			this.#close(traceId, spanId, pending, toMs(event.timestamp), null);
		}
	}

	attributes(event: TailStream.TailEvent<TailStream.Attributes>) {
		const { traceId, spanId } = ids(event);
		if (!spanId || !this.#spans.has(spanId)) {
			return;
		}
		const attrs: Record<string, unknown> = {};
		for (const attr of event.event.info) {
			attrs[attr.name] = normalizeAttr(attr.value);
		}
		if (Object.keys(attrs).length > 0) {
			this.#track(this.store.mergeAttributes(traceId, spanId, attrs));
		}
	}

	return(event: TailStream.TailEvent<TailStream.Return>) {
		const { traceId, spanId } = ids(event);
		const pending = spanId ? this.#spans.get(spanId) : undefined;
		if (spanId && pending && event.event.info?.type === "fetch") {
			this.#track(
				this.store.mergeAttributes(traceId, spanId, {
					"http.response.status_code": event.event.info.statusCode,
				})
			);
		}
	}

	log(event: TailStream.TailEvent<TailStream.Log>) {
		const { traceId, spanId } = ids(event);
		// `console.log` surfaces as level "log"; fold into "info" so the stored set
		// stays {debug, info, warn, error}.
		const level = event.event.level === "log" ? "info" : event.event.level;
		this.#track(
			this.store.appendLog({
				traceId,
				spanId: spanId ?? null,
				tsMs: toMs(event.timestamp),
				level,
				message: serialize(event.event.message),
				operation: null,
			})
		);
	}

	exception(event: TailStream.TailEvent<TailStream.Exception>) {
		const { traceId, spanId } = ids(event);
		const pending = spanId ? this.#spans.get(spanId) : undefined;
		const type = event.event.name || "Error";
		const message = event.event.message ?? "";
		const head = `${type}: ${message}`;
		const text = event.event.stack ? `${head}\n${event.event.stack}` : head;
		if (pending) {
			// Recorded on the span so it lands as `error`/outcome when it closes.
			pending.errored = true;
			pending.outcome = "error";
			pending.error = head;
		}
		// Surface exceptions as error-level logs too, so failures show in the Logs
		// view even when the worker never called console.error.
		this.#track(
			this.store.appendLog({
				traceId,
				spanId: spanId ?? null,
				tsMs: toMs(event.timestamp),
				level: "error",
				message: serialize(text),
				operation: pending?.name ?? null,
			})
		);
	}

	async outcome(event: TailStream.TailEvent<TailStream.Outcome>) {
		const endMs = toMs(event.timestamp);
		const traceId = this.#traceId ?? event.spanContext.traceId;
		const root = this.#rootSpanId
			? this.#spans.get(this.#rootSpanId)
			: undefined;
		if (root && this.#rootSpanId) {
			if (ERROR_OUTCOMES.has(event.event.outcome)) {
				root.errored = true;
			}
			root.outcome = event.event.outcome;
			// The root closes with the invocation: fold in the final outcome and
			// resource attributes at the same time.
			this.#close(traceId, this.#rootSpanId, root, endMs, {
				"cloudflare.outcome": event.event.outcome,
				cpu_time_ms: event.event.cpuTime,
				wall_time_ms: event.event.wallTime,
			});
		}

		// Close any span left open (error/bug) so it still shows in the waterfall.
		for (const [spanId, pending] of this.#spans) {
			if (!pending.closed) {
				this.#close(pending.traceId, spanId, pending, endMs, null);
			}
		}

		// One synthetic invocation log so silent workers still appear.
		if (this.#rootSpanId && this.#invocationBody !== null) {
			this.#track(
				this.store.appendLog({
					traceId,
					spanId: this.#rootSpanId,
					tsMs: this.#startMs ?? endMs,
					level: root?.errored ? "error" : "info",
					message: serialize(this.#invocationBody),
					operation: null,
				})
			);
		}

		await Promise.all(this.#writes);
	}

	/** Open a span in-flight (duration stays NULL until it closes). */
	#open(input: SpanInput) {
		this.#track(this.store.openSpan(input));
	}

	/** Finalise a span once, folding in its duration, outcome and any final attrs. */
	#close(
		traceId: string,
		spanId: string,
		pending: PendingSpan,
		endMs: number,
		attributes: Record<string, unknown> | null
	) {
		if (pending.closed) {
			return;
		}
		pending.closed = true;
		this.#track(
			this.store.closeSpan(traceId, spanId, {
				durationMs: Math.max(0, endMs - pending.startMs),
				outcome: pending.outcome ?? (pending.errored ? "error" : "ok"),
				error: pending.error,
				attributes,
			})
		);
	}

	/** Track an in-flight store write so `outcome` can await completion. */
	#track(result: void | Promise<unknown>) {
		this.#writes.push(Promise.resolve(result));
	}
}

/**
 * Tail attribute values can be bigint (or bigint arrays); `JSON.stringify` throws
 * on those. Downcast to number where safe, else string, so the value survives
 * serialization into the store's `attributes` blob.
 */
function normalizeAttr(value: TailStream.Attribute["value"]): unknown {
	if (Array.isArray(value)) {
		return value.map((v) => (typeof v === "bigint" ? bigintToJson(v) : v));
	}
	return typeof value === "bigint" ? bigintToJson(value) : value;
}

function bigintToJson(value: bigint): number | string {
	return value >= Number.MIN_SAFE_INTEGER && value <= Number.MAX_SAFE_INTEGER
		? Number(value)
		: value.toString();
}

function serialize(value: unknown): string {
	try {
		return JSON.stringify(value ?? "");
	} catch {
		return String(value);
	}
}
