/**
 * Converts the spans workerd exports over OTLP (`tracing.otlp`) into the spans
 * the store keeps. workerd POSTs each traced invocation's spans to the
 * collector's `/v1/traces` as an OTLP/HTTP protobuf `ExportTraceServiceRequest`,
 * one `ResourceSpans` per service, whose `service.name` resource attribute is the
 * workerd service name.
 *
 * Only the fields workerd sets are decoded, by a small protobuf reader rather
 * than an OpenTelemetry dependency. We keep the attribute names workerd sends,
 * which are the ones the Workers Observability UI expects (`faas.trigger`,
 * `http.request.method`, `cloudflare.outcome`, `cpu_time_ms`, …). The URLs and
 * headers belong to the developer, so nothing is redacted.
 */
import type { SpanInput } from "./trace-types";

/**
 * The workerd services whose spans the collector keeps, mapped to the worker
 * name the spans are attributed to. workerd exports the spans of every service,
 * including Miniflare's own; the collector drops those of services not listed
 * here.
 */
export type TracedServices = Record<string, string>;

/**
 * The spans in `body` that belong to one of `tracedServices`. Spans of other
 * services (Miniflare's own Workers, and workerd's `workers-runtime` request
 * span) are dropped. A dropped span can be the parent of a kept one: the store
 * keeps such a span as a root (see `TraceStore.persist()`).
 */
export function decodeExportTraceServiceRequest(
	body: Uint8Array,
	tracedServices: TracedServices
): SpanInput[] {
	const rows: SpanInput[] = [];
	const request = new Reader(body);
	while (request.next()) {
		if (request.field !== 1) {
			request.skip();
			continue;
		}
		// ResourceSpans
		const resourceSpans = request.message();
		let service: string | undefined;
		const scopeSpans: Reader[] = [];
		while (resourceSpans.next()) {
			if (resourceSpans.field === 1) {
				const attributes = decodeAttributes(resourceSpans.message(), 1);
				const name = attributes["service.name"];
				if (typeof name === "string" && Object.hasOwn(tracedServices, name)) {
					service = tracedServices[name];
				}
			} else if (resourceSpans.field === 2) {
				scopeSpans.push(resourceSpans.message());
			} else {
				resourceSpans.skip();
			}
		}
		if (service === undefined) {
			continue;
		}
		for (const scope of scopeSpans) {
			while (scope.next()) {
				if (scope.field === 2) {
					rows.push(decodeSpan(scope.message(), service));
				} else {
					scope.skip();
				}
			}
		}
	}
	return rows;
}

const STATUS_CODE_ERROR = 2;

function decodeSpan(span: Reader, service: string): SpanInput {
	let traceId = "";
	let spanId = "";
	let parentId: string | null = null;
	let name = "";
	let startNs = 0n;
	let endNs = 0n;
	const attributes: Record<string, unknown> = {};
	let exception: string | null = null;
	let statusCode = 0;
	let statusMessage = "";
	while (span.next()) {
		switch (span.field) {
			case 1:
				traceId = toHex(span.bytes());
				break;
			case 2:
				spanId = toHex(span.bytes());
				break;
			case 4: {
				const parent = span.bytes();
				parentId = parent.length > 0 ? toHex(parent) : null;
				break;
			}
			case 5:
				name = span.string();
				break;
			case 7:
				startNs = span.fixed64();
				break;
			case 8:
				endNs = span.fixed64();
				break;
			case 9:
				Object.assign(attributes, decodeKeyValue(span.message()));
				break;
			case 11: {
				// Event. workerd records each exception as an `exception` event; the
				// last one describes the span's error.
				const event = span.message();
				let eventName = "";
				const eventAttributes: Record<string, unknown> = {};
				while (event.next()) {
					if (event.field === 2) {
						eventName = event.string();
					} else if (event.field === 3) {
						Object.assign(eventAttributes, decodeKeyValue(event.message()));
					} else {
						event.skip();
					}
				}
				if (eventName === "exception") {
					const type = eventAttributes["exception.type"] || "Error";
					const message = eventAttributes["exception.message"] ?? "";
					exception = `${type}: ${message}`;
				}
				break;
			}
			case 15: {
				const status = span.message();
				while (status.next()) {
					if (status.field === 2) {
						statusMessage = status.string();
					} else if (status.field === 3) {
						statusCode = Number(status.varint());
					} else {
						status.skip();
					}
				}
				break;
			}
			default:
				span.skip();
		}
	}

	const failed = statusCode === STATUS_CODE_ERROR;
	// The invocation's span carries the invocation's outcome (`exception`,
	// `exceededCpu`, …); any other span is "ok" or "error".
	const outcome =
		typeof attributes["cloudflare.outcome"] === "string"
			? attributes["cloudflare.outcome"]
			: failed
				? "error"
				: "ok";
	const startMs = nsToMs(startNs);
	return {
		traceId,
		spanId,
		parentId,
		service,
		name,
		kind: friendlyKind(attributes["faas.trigger"], name),
		startMs,
		durationMs: Math.max(0, nsToMs(endNs) - startMs),
		outcome,
		error: failed
			? (exception ?? errorMessage(statusMessage, attributes))
			: null,
		attributes,
	};
}

/**
 * What went wrong in a failed span with no exception event: the status message,
 * or failing that the `error.type` workerd derives from the outcome or the HTTP
 * status.
 */
function errorMessage(
	statusMessage: string,
	attributes: Record<string, unknown>
): string | null {
	if (statusMessage !== "") {
		return statusMessage;
	}
	const errorType = attributes["error.type"];
	return errorType === undefined || errorType === null
		? null
		: String(errorType);
}

/** Friendly `kind` for the UI: root span from its trigger, children from name. */
function friendlyKind(faasTrigger: unknown, name: string): string {
	if (typeof faasTrigger === "string") {
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

/** The `KeyValue`s at `field` of `message`, as a plain object. */
function decodeAttributes(
	message: Reader,
	field: number
): Record<string, unknown> {
	const attributes: Record<string, unknown> = {};
	while (message.next()) {
		if (message.field === field) {
			Object.assign(attributes, decodeKeyValue(message.message()));
		} else {
			message.skip();
		}
	}
	return attributes;
}

function decodeKeyValue(keyValue: Reader): Record<string, unknown> {
	let key = "";
	let value: unknown = null;
	while (keyValue.next()) {
		if (keyValue.field === 1) {
			key = keyValue.string();
		} else if (keyValue.field === 2) {
			value = decodeAnyValue(keyValue.message());
		} else {
			keyValue.skip();
		}
	}
	return { [key]: value };
}

function decodeAnyValue(anyValue: Reader): unknown {
	let value: unknown = null;
	while (anyValue.next()) {
		switch (anyValue.field) {
			case 1:
				value = anyValue.string();
				break;
			case 2:
				value = anyValue.varint() !== 0n;
				break;
			case 3:
				value = int64ToJson(BigInt.asIntN(64, anyValue.varint()));
				break;
			case 4:
				value = anyValue.double();
				break;
			case 5: {
				// ArrayValue
				const array = anyValue.message();
				const values: unknown[] = [];
				while (array.next()) {
					if (array.field === 1) {
						values.push(decodeAnyValue(array.message()));
					} else {
						array.skip();
					}
				}
				value = values;
				break;
			}
			default:
				anyValue.skip();
		}
	}
	return value;
}

/** Downcast to number where safe, else string, so it survives `JSON.stringify`. */
function int64ToJson(value: bigint): number | string {
	return value >= Number.MIN_SAFE_INTEGER && value <= Number.MAX_SAFE_INTEGER
		? Number(value)
		: value.toString();
}

/** Epoch nanoseconds to epoch milliseconds, keeping microseconds. */
function nsToMs(ns: bigint): number {
	return Number(ns / 1000n) / 1000;
}

function toHex(bytes: Uint8Array): string {
	let hex = "";
	for (const byte of bytes) {
		hex += byte.toString(16).padStart(2, "0");
	}
	return hex;
}

const WIRE_VARINT = 0;
const WIRE_FIXED64 = 1;
const WIRE_LENGTH_DELIMITED = 2;
const WIRE_FIXED32 = 5;

const textDecoder = new TextDecoder();

/**
 * Reads the fields of one protobuf message: call `next()` to advance to the
 * next field, then read its value with the method for its type, or `skip()` it.
 */
class Reader {
	field = 0;
	#wireType = 0;
	#pos: number;
	#end: number;
	#view: DataView;

	constructor(
		private readonly buffer: Uint8Array,
		start = 0,
		end = buffer.length
	) {
		this.#pos = start;
		this.#end = end;
		this.#view = new DataView(
			buffer.buffer,
			buffer.byteOffset,
			buffer.byteLength
		);
	}

	next(): boolean {
		if (this.#pos >= this.#end) {
			return false;
		}
		const tag = Number(this.varint());
		this.field = tag >>> 3;
		this.#wireType = tag & 7;
		return true;
	}

	varint(): bigint {
		let result = 0n;
		let shift = 0n;
		for (;;) {
			if (this.#pos >= this.#end) {
				throw new Error("truncated OTLP message");
			}
			const byte = this.buffer[this.#pos++];
			result |= BigInt(byte & 0x7f) << shift;
			if (byte < 0x80) {
				return result;
			}
			shift += 7n;
		}
	}

	fixed64(): bigint {
		return this.#view.getBigUint64(this.#take(8), true);
	}

	double(): number {
		return this.#view.getFloat64(this.#take(8), true);
	}

	bytes(): Uint8Array {
		const length = Number(this.varint());
		const start = this.#take(length);
		return this.buffer.subarray(start, start + length);
	}

	string(): string {
		return textDecoder.decode(this.bytes());
	}

	message(): Reader {
		const length = Number(this.varint());
		const start = this.#take(length);
		return new Reader(this.buffer, start, start + length);
	}

	skip(): void {
		switch (this.#wireType) {
			case WIRE_VARINT:
				this.varint();
				break;
			case WIRE_FIXED64:
				this.#take(8);
				break;
			case WIRE_LENGTH_DELIMITED:
				this.#take(Number(this.varint()));
				break;
			case WIRE_FIXED32:
				this.#take(4);
				break;
			default:
				throw new Error(`unsupported protobuf wire type ${this.#wireType}`);
		}
	}

	/** Advances past `length` bytes, returning where they start. */
	#take(length: number): number {
		const start = this.#pos;
		if (start + length > this.#end) {
			throw new Error("truncated OTLP message");
		}
		this.#pos += length;
		return start;
	}
}
