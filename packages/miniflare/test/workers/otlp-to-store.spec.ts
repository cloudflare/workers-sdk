import { test } from "vitest";
import { decodeExportTraceServiceRequest } from "../../src/workers/observability/otlp-to-store";
import type { TracedServices } from "../../src/workers/observability/otlp-to-store";

// A minimal protobuf encoder for building the `ExportTraceServiceRequest`s
// workerd sends. Field numbers follow opentelemetry-proto's trace/v1 and
// common/v1 messages.

const WIRE_VARINT = 0;
const WIRE_FIXED64 = 1;
const WIRE_LENGTH_DELIMITED = 2;

type Field = Uint8Array;

function concat(parts: Uint8Array[]): Uint8Array {
	const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
	let offset = 0;
	for (const part of parts) {
		out.set(part, offset);
		offset += part.length;
	}
	return out;
}

function varint(value: bigint): Uint8Array {
	// Negative int64s are encoded as their 64-bit two's complement.
	let rest = BigInt.asUintN(64, value);
	const bytes: number[] = [];
	do {
		const byte = Number(rest & 0x7fn);
		rest >>= 7n;
		bytes.push(rest === 0n ? byte : byte | 0x80);
	} while (rest !== 0n);
	return new Uint8Array(bytes);
}

function tag(field: number, wireType: number): Uint8Array {
	return varint(BigInt((field << 3) | wireType));
}

function varintField(field: number, value: bigint): Field {
	return concat([tag(field, WIRE_VARINT), varint(value)]);
}

function fixed64Field(field: number, value: bigint): Field {
	const bytes = new Uint8Array(8);
	new DataView(bytes.buffer).setBigUint64(0, value, true);
	return concat([tag(field, WIRE_FIXED64), bytes]);
}

function doubleField(field: number, value: number): Field {
	const bytes = new Uint8Array(8);
	new DataView(bytes.buffer).setFloat64(0, value, true);
	return concat([tag(field, WIRE_FIXED64), bytes]);
}

function bytesField(field: number, value: Uint8Array): Field {
	return concat([
		tag(field, WIRE_LENGTH_DELIMITED),
		varint(BigInt(value.length)),
		value,
	]);
}

function stringField(field: number, value: string): Field {
	return bytesField(field, new TextEncoder().encode(value));
}

function messageField(field: number, ...fields: Field[]): Field {
	return bytesField(field, concat(fields));
}

function hex(value: string): Uint8Array {
	return new Uint8Array(
		value.match(/../g)?.map((byte) => parseInt(byte, 16)) ?? []
	);
}

type AnyValue =
	| { string: string }
	| { bool: boolean }
	| { int: bigint }
	| { double: number }
	| { array: AnyValue[] };

function anyValue(field: number, value: AnyValue): Field {
	if ("string" in value) {
		return messageField(field, stringField(1, value.string));
	}
	if ("bool" in value) {
		return messageField(field, varintField(2, value.bool ? 1n : 0n));
	}
	if ("int" in value) {
		return messageField(field, varintField(3, value.int));
	}
	if ("double" in value) {
		return messageField(field, doubleField(4, value.double));
	}
	return messageField(
		field,
		messageField(5, ...value.array.map((item) => anyValue(1, item)))
	);
}

/** A `KeyValue` at `field`. */
function keyValue(field: number, key: string, value: AnyValue): Field {
	return messageField(field, stringField(1, key), anyValue(2, value));
}

interface SpanFields {
	traceId?: string;
	spanId: string;
	parentId?: string;
	name?: string;
	startNs?: bigint;
	endNs?: bigint;
	attributes?: Record<string, AnyValue>;
	exceptions?: Array<{ type?: string; message?: string }>;
	status?: { code: number; message?: string };
}

const TRACE_ID = "0123456789abcdef0123456789abcdef";
const START_NS = 1_700_000_000_123_456_789n;

function spanMessage(span: SpanFields): Field {
	const fields = [
		bytesField(1, hex(span.traceId ?? TRACE_ID)),
		bytesField(2, hex(span.spanId)),
	];
	if (span.parentId !== undefined) {
		fields.push(bytesField(4, hex(span.parentId)));
	}
	fields.push(
		stringField(5, span.name ?? "span"),
		fixed64Field(7, span.startNs ?? START_NS),
		fixed64Field(8, span.endNs ?? START_NS + 1_000_000n)
	);
	for (const [key, value] of Object.entries(span.attributes ?? {})) {
		fields.push(keyValue(9, key, value));
	}
	for (const exception of span.exceptions ?? []) {
		const attributes = [];
		if (exception.type !== undefined) {
			attributes.push(
				keyValue(3, "exception.type", { string: exception.type })
			);
		}
		if (exception.message !== undefined) {
			attributes.push(
				keyValue(3, "exception.message", { string: exception.message })
			);
		}
		fields.push(messageField(11, stringField(2, "exception"), ...attributes));
	}
	if (span.status !== undefined) {
		const status = [varintField(3, BigInt(span.status.code))];
		if (span.status.message !== undefined) {
			status.unshift(stringField(2, span.status.message));
		}
		fields.push(messageField(15, ...status));
	}
	return messageField(2, ...fields);
}

/** One `ResourceSpans` for `service`, holding `spans` in a single scope. */
function resourceSpans(service: string, spans: SpanFields[]): Field {
	return messageField(
		1,
		messageField(1, keyValue(1, "service.name", { string: service })),
		messageField(2, ...spans.map(spanMessage))
	);
}

function request(...resources: Field[]): Uint8Array {
	return concat(resources);
}

const TRACED: TracedServices = { "core:user:my-worker": "my-worker" };

test("decodes a span", ({ expect }) => {
	const [span] = decodeExportTraceServiceRequest(
		request(
			resourceSpans("core:user:my-worker", [
				{
					spanId: "1111111111111111",
					name: "fetch",
					startNs: START_NS,
					endNs: START_NS + 2_500_000n,
					attributes: {
						"faas.trigger": { string: "http" },
						"cloudflare.outcome": { string: "ok" },
						"http.response.status_code": { int: 200n },
						cpu_time_ms: { double: 1.5 },
						"cloudflare.cold_start": { bool: true },
						"http.request.header.accept": {
							array: [{ string: "text/html" }, { string: "*/*" }],
						},
					},
				},
			])
		),
		TRACED
	);

	expect(span).toEqual({
		traceId: TRACE_ID,
		spanId: "1111111111111111",
		parentId: null,
		service: "my-worker",
		name: "fetch",
		kind: "http",
		startMs: 1_700_000_000_123.456,
		durationMs: 2.5,
		outcome: "ok",
		error: null,
		attributes: {
			"faas.trigger": "http",
			"cloudflare.outcome": "ok",
			"http.response.status_code": 200,
			cpu_time_ms: 1.5,
			"cloudflare.cold_start": true,
			"http.request.header.accept": ["text/html", "*/*"],
		},
	});
});

test("decodes a child span's parent and kind", ({ expect }) => {
	const [span] = decodeExportTraceServiceRequest(
		request(
			resourceSpans("core:user:my-worker", [
				{
					spanId: "2222222222222222",
					parentId: "1111111111111111",
					name: "kv_get",
				},
			])
		),
		TRACED
	);

	expect(span).toMatchObject({
		parentId: "1111111111111111",
		kind: "kv",
		outcome: "ok",
	});
});

test("keeps only the spans of traced services", ({ expect }) => {
	const spans = decodeExportTraceServiceRequest(
		request(
			resourceSpans("core:entry", [{ spanId: "aaaaaaaaaaaaaaaa" }]),
			resourceSpans("core:user:my-worker", [{ spanId: "bbbbbbbbbbbbbbbb" }]),
			// Inherited object keys are not traced services.
			resourceSpans("constructor", [{ spanId: "cccccccccccccccc" }])
		),
		TRACED
	);

	expect(spans.map(({ spanId, service }) => ({ spanId, service }))).toEqual([
		{ spanId: "bbbbbbbbbbbbbbbb", service: "my-worker" },
	]);
});

test("keeps int64 attributes beyond the safe-integer range as strings", ({
	expect,
}) => {
	const [span] = decodeExportTraceServiceRequest(
		request(
			resourceSpans("core:user:my-worker", [
				{
					spanId: "1111111111111111",
					attributes: {
						max: { int: BigInt(Number.MAX_SAFE_INTEGER) },
						beyond: { int: BigInt(Number.MAX_SAFE_INTEGER) + 1n },
						negative: { int: -1n },
						min: { int: -(2n ** 63n) },
					},
				},
			])
		),
		TRACED
	);

	expect(span.attributes).toEqual({
		max: Number.MAX_SAFE_INTEGER,
		beyond: "9007199254740992",
		negative: -1,
		min: "-9223372036854775808",
	});
});

test("describes a failed span by its exception, then status, then error.type", ({
	expect,
}) => {
	const ERROR = 2;
	const spans = decodeExportTraceServiceRequest(
		request(
			resourceSpans("core:user:my-worker", [
				{
					spanId: "1111111111111111",
					exceptions: [
						{ type: "TypeError", message: "first" },
						{ type: "RangeError", message: "last" },
					],
					status: { code: ERROR, message: "status message" },
					attributes: { "error.type": { string: "500" } },
				},
				{
					spanId: "2222222222222222",
					exceptions: [{ message: "untyped" }],
					status: { code: ERROR },
				},
				{
					spanId: "3333333333333333",
					status: { code: ERROR, message: "status message" },
					attributes: { "error.type": { string: "500" } },
				},
				{
					spanId: "4444444444444444",
					status: { code: ERROR },
					attributes: { "error.type": { string: "500" } },
				},
				{ spanId: "5555555555555555", status: { code: ERROR } },
				// Only a failed span has an error, even with an exception event.
				{
					spanId: "6666666666666666",
					exceptions: [{ type: "Error", message: "caught" }],
				},
			])
		),
		TRACED
	);

	expect(spans.map(({ error, outcome }) => ({ error, outcome }))).toEqual([
		{ error: "RangeError: last", outcome: "error" },
		{ error: "Error: untyped", outcome: "error" },
		{ error: "status message", outcome: "error" },
		{ error: "500", outcome: "error" },
		{ error: null, outcome: "error" },
		{ error: null, outcome: "ok" },
	]);
});

test("takes the invocation's outcome from cloudflare.outcome", ({ expect }) => {
	const [span] = decodeExportTraceServiceRequest(
		request(
			resourceSpans("core:user:my-worker", [
				{
					spanId: "1111111111111111",
					attributes: { "cloudflare.outcome": { string: "exceededCpu" } },
					status: { code: 2 },
				},
			])
		),
		TRACED
	);

	expect(span.outcome).toBe("exceededCpu");
});

test("skips unknown fields", ({ expect }) => {
	const body = request(
		// Unknown top-level fields of each wire type.
		varintField(9, 1n),
		fixed64Field(10, 1n),
		stringField(11, "ignored"),
		resourceSpans("core:user:my-worker", [{ spanId: "1111111111111111" }])
	);

	expect(decodeExportTraceServiceRequest(body, TRACED)).toHaveLength(1);
});

test("throws on a truncated message", ({ expect }) => {
	const body = request(
		resourceSpans("core:user:my-worker", [{ spanId: "1111111111111111" }])
	);

	for (const length of [1, 5, body.length - 1]) {
		expect(() =>
			decodeExportTraceServiceRequest(body.subarray(0, length), TRACED)
		).toThrow("truncated OTLP message");
	}
});

test("throws on an unsupported wire type", ({ expect }) => {
	// Wire type 3 (start group) is deprecated and never sent by workerd.
	expect(() => decodeExportTraceServiceRequest(tag(9, 3), TRACED)).toThrow(
		"unsupported protobuf wire type 3"
	);
});

test("decodes an empty request", ({ expect }) => {
	expect(decodeExportTraceServiceRequest(new Uint8Array(), TRACED)).toEqual([]);
});
