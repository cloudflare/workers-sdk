import assert from "node:assert";
import { Buffer } from "node:buffer";

// This file implements `devalue` reducers and revivers for structured-
// serialisable types not supported by default. See serialisable types here:
// https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm#supported_types

export type ReducersRevivers = Record<string, (value: unknown) => unknown>;

const ALLOWED_ARRAY_BUFFER_VIEW_CONSTRUCTORS = [
	DataView,
	Int8Array,
	Uint8Array,
	Uint8ClampedArray,
	Int16Array,
	Uint16Array,
	Int32Array,
	Uint32Array,
	Float32Array,
	Float64Array,
	BigInt64Array,
	BigUint64Array,
] as const;
const ALLOWED_ERROR_CONSTRUCTORS = [
	EvalError,
	RangeError,
	ReferenceError,
	SyntaxError,
	TypeError,
	URIError,
	Error, // `Error` last so more specific error subclasses preferred
] as const;

export const structuredSerializableReducers: ReducersRevivers = {
	ArrayBuffer(value) {
		if (value instanceof ArrayBuffer) {
			return Buffer.from(value).toString("base64");
		}
	},
	ArrayBufferView(value) {
		if (ArrayBuffer.isView(value)) {
			return [
				value.constructor.name,
				value.buffer,
				value.byteOffset,
				value.byteLength,
			];
		}
	},
	Error(value) {
		for (const ctor of ALLOWED_ERROR_CONSTRUCTORS) {
			if (value instanceof ctor && value.name === ctor.name) {
				return [value.name, value.message, value.stack, value.cause];
			}
		}
		if (value instanceof Error) {
			return ["Error", value.message, value.stack, value.cause];
		}
	},
};
export const structuredSerializableRevivers: ReducersRevivers = {
	ArrayBuffer(value) {
		assert(typeof value === "string");
		const view = Buffer.from(value, "base64");
		return view.buffer.slice(
			view.byteOffset,
			view.byteOffset + view.byteLength
		);
	},
	ArrayBufferView(value) {
		assert(Array.isArray(value));
		const [name, buffer, byteOffset, byteLength] = value as unknown[];
		assert(typeof name === "string");
		assert(buffer instanceof ArrayBuffer);
		assert(typeof byteOffset === "number");
		assert(typeof byteLength === "number");
		const ctor = (globalThis as Record<string, unknown>)[
			name
		] as (typeof ALLOWED_ARRAY_BUFFER_VIEW_CONSTRUCTORS)[number];
		assert(ALLOWED_ARRAY_BUFFER_VIEW_CONSTRUCTORS.includes(ctor));
		let length = byteLength;
		if ("BYTES_PER_ELEMENT" in ctor) length /= ctor.BYTES_PER_ELEMENT;
		return new ctor(buffer, byteOffset, length);
	},
	Error(value) {
		assert(Array.isArray(value));
		const [name, message, stack, cause] = value as unknown[];
		assert(typeof name === "string");
		assert(typeof message === "string");
		assert(stack === undefined || typeof stack === "string");
		const ctor = (globalThis as Record<string, unknown>)[
			name
		] as (typeof ALLOWED_ERROR_CONSTRUCTORS)[number];
		assert(ALLOWED_ERROR_CONSTRUCTORS.includes(ctor));
		const error = new ctor(message, { cause });
		error.stack = stack;
		return error;
	},
};
