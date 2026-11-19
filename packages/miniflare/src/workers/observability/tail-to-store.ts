/**
 * Converts one invocation's workerd tail events into the logs the store keeps:
 * its `console` calls, its exceptions, and one log for the invocation itself.
 * The invocation's spans reach the collector over OTLP instead (see
 * `otlp-to-store.ts`). Logs reference spans by the ids the tail events carry,
 * which are the ids workerd exports the spans with.
 *
 * Each log is submitted to the collector-wide bounded persistence batch as soon
 * as it arrives.
 */
import type { LogInput } from "./trace-types";
import type { BatchStore, TraceWriter, TraceWriterOwner } from "./trace-writer";

/** A tail event's `timestamp` is a `Date` (or ms number); normalise to epoch ms. */
function toMs(timestamp: Date | number): number {
	return typeof timestamp === "number" ? timestamp : timestamp.getTime();
}

/** The name the invocation's span gets from its trigger, as workerd names it. */
function triggerName(info: TailStream.Onset["info"]): string {
	return info.type === "fetch" ? info.method : info.type;
}

/**
 * Handles the tail events for a single invocation. The collector-wide writer
 * batches rows, bounds pending persistence, and serialises store RPCs.
 */
export class TailToStoreHandler implements TailStream.TailEventHandlerObject {
	#traceId: string;
	#rootSpanId: string;
	#rootName: string;
	#startMs: number;
	#invocationBody: string;
	#errored = false;
	#owner: TraceWriterOwner;

	constructor(
		private readonly writer: TraceWriter,
		store: BatchStore,
		onset: TailStream.TailEvent<TailStream.Onset>
	) {
		this.#owner = this.writer.createOwner(store);
		this.#traceId = onset.spanContext.traceId;
		this.#rootSpanId = onset.event.spanId;
		this.#rootName = triggerName(onset.event.info);
		this.#startMs = toMs(onset.timestamp);
		// Invocation-log body: for fetch, method + URL (mirrors the prod Logs view);
		// otherwise the trigger name.
		this.#invocationBody =
			onset.event.info.type === "fetch"
				? `${onset.event.info.method} ${onset.event.info.url}`
				: this.#rootName;
	}

	log(event: TailStream.TailEvent<TailStream.Log>) {
		// `console.log` surfaces as level "log"; fold into "info" so the stored set
		// stays {debug, info, warn, error}.
		const level = event.event.level === "log" ? "info" : event.event.level;
		this.#append({
			traceId: event.spanContext.traceId,
			spanId: event.spanContext.spanId ?? null,
			tsMs: toMs(event.timestamp),
			level,
			message: serialize(event.event.message),
			operation: null,
		});
	}

	exception(event: TailStream.TailEvent<TailStream.Exception>) {
		const spanId = event.spanContext.spanId ?? null;
		const type = event.event.name || "Error";
		const message = event.event.message ?? "";
		const head = `${type}: ${message}`;
		const text = event.event.stack ? `${head}\n${event.event.stack}` : head;
		const onRoot = spanId === this.#rootSpanId;
		if (onRoot) {
			this.#errored = true;
		}
		// Surface exceptions as error-level logs, so failures show in the Logs view
		// even when the worker never called console.error.
		this.#append({
			traceId: event.spanContext.traceId,
			spanId,
			tsMs: toMs(event.timestamp),
			level: "error",
			message: serialize(text),
			operation: onRoot ? this.#rootName : null,
		});
	}

	async outcome(event: TailStream.TailEvent<TailStream.Outcome>) {
		// Every `EventOutcome` other than "ok" is a failure (canceled, exception,
		// exceededCpu, …), as the read side's `outcome != 'ok'` has it.
		if (event.event.outcome !== "ok") {
			this.#errored = true;
		}
		// One synthetic invocation log so silent workers still appear.
		this.#append({
			traceId: this.#traceId,
			spanId: this.#rootSpanId,
			tsMs: this.#startMs,
			level: this.#errored ? "error" : "info",
			message: serialize(this.#invocationBody),
			operation: null,
		});
		await this.writer.drain(this.#owner);
	}

	#append(log: LogInput) {
		this.writer.enqueueLog(this.#owner, log);
	}
}

function serialize(value: unknown): string {
	try {
		return JSON.stringify(value ?? "");
	} catch {
		return String(value);
	}
}
