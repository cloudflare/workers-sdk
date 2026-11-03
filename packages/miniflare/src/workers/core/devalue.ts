import assert from "node:assert";
import { Buffer } from "node:buffer";

// This file implements `devalue` reducers and revivers for structured-
// serialisable types not supported by default. See serialisable types here:
// https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm#supported_types

export type ReducerReviver = (value: unknown) => unknown;
export type ReducersRevivers = Record<string, ReducerReviver>;

const ALLOWED_ARRAY_BUFFER_VIEW_CONSTRUCTORS = [
	DataView<ArrayBuffer>,
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
			// Return single element array so empty `ArrayBuffer` serialised as truthy
			return [Buffer.from(value).toString("base64")];
		}
	},
	ArrayBufferView(value) {
		if (ArrayBuffer.isView(value)) {
			let name = value.constructor.name;
			// Subclasses like Node.js `Buffer` extend standard typed arrays but
			// aren't available in all runtimes. Normalise to the parent constructor.
			if (
				!ALLOWED_ARRAY_BUFFER_VIEW_CONSTRUCTORS.some((c) => c.name === name)
			) {
				for (const ctor of ALLOWED_ARRAY_BUFFER_VIEW_CONSTRUCTORS) {
					if (value instanceof ctor) {
						name = ctor.name;
						break;
					}
				}
			}
			let buf = value.buffer;
			let off = value.byteOffset;
			if (off !== 0 || buf.byteLength !== value.byteLength) {
				buf = buf.slice(off, off + value.byteLength);
				off = 0;
			}
			return [name, buf, off, value.byteLength];
		}
	},
	RegExp(value) {
		if (value instanceof RegExp) {
			const { source, flags } = value;
			const encoded = Buffer.from(source).toString("base64");
			return flags ? ["RegExp", encoded, flags] : ["RegExp", encoded];
		}
	},
	Error(value) {
		for (const ctor of ALLOWED_ERROR_CONSTRUCTORS) {
			if (value instanceof ctor && value.name === ctor.name) {
				return serializeError(value, value.name);
			}
		}
		if (value instanceof Error) {
			return serializeError(value, "Error");
		}
	},
};

const RESERVED_ERROR_KEYS = new Set(["name", "message", "stack", "cause"]);

function isPrimitiveErrorProperty(
	value: unknown
): value is string | number | boolean | null {
	return (
		value === null ||
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "boolean"
	);
}

// Errors from bindings carry machine-readable properties such as Artifacts'
// `code` and `numericCode`, and custom names such as `ArtifactsError`. Preserve
// primitive own properties and the original name so Node callers can branch on
// them. Like workerd's `enhanced_error_serialization`, this includes
// non-enumerable properties. Non-primitive properties are skipped so they
// cannot make an error unserialisable.
function serializeError(error: Error, constructorName: string): unknown[] {
	const properties: Record<string, string | number | boolean | null> = {};
	for (const key of Object.getOwnPropertyNames(error)) {
		const property = (error as unknown as Record<string, unknown>)[key];
		if (!RESERVED_ERROR_KEYS.has(key) && isPrimitiveErrorProperty(property)) {
			properties[key] = property;
		}
	}
	if (typeof error.name === "string" && error.name !== constructorName) {
		properties.name = error.name;
	}
	const serialized: unknown[] = [
		constructorName,
		error.message,
		error.stack,
		error.cause,
	];
	if (Object.keys(properties).length > 0) {
		serialized.push(properties);
	}
	return serialized;
}
export const structuredSerializableRevivers: ReducersRevivers = {
	ArrayBuffer(value) {
		assert(Array.isArray(value));
		const [encoded] = value as unknown[];
		assert(typeof encoded === "string");
		const view = Buffer.from(encoded, "base64");
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
		if ("BYTES_PER_ELEMENT" in ctor) {
			length /= ctor.BYTES_PER_ELEMENT;
		}
		return new ctor(buffer as ArrayBuffer, byteOffset, length);
	},
	RegExp(value) {
		assert(Array.isArray(value));
		const [name, encoded, flags] = value;
		assert(typeof name === "string");
		assert(typeof encoded === "string");
		const source = Buffer.from(encoded, "base64").toString("utf-8");
		return new RegExp(source, flags);
	},
	Error(value) {
		assert(Array.isArray(value));
		const [name, message, stack, cause, properties] = value as unknown[];
		assert(typeof name === "string");
		assert(typeof message === "string");
		assert(stack === undefined || typeof stack === "string");
		const ctor = (globalThis as Record<string, unknown>)[
			name
		] as (typeof ALLOWED_ERROR_CONSTRUCTORS)[number];
		assert(ALLOWED_ERROR_CONSTRUCTORS.includes(ctor));
		const error = new ctor(message, { cause });
		error.stack = stack;
		if (properties !== undefined) {
			assert(typeof properties === "object" && properties !== null);
			for (const [key, property] of Object.entries(properties)) {
				if (
					(key === "name" || !RESERVED_ERROR_KEYS.has(key)) &&
					isPrimitiveErrorProperty(property)
				) {
					Object.defineProperty(error, key, {
						value: property,
						writable: true,
						enumerable: key !== "name",
						configurable: true,
					});
				}
			}
		}
		return error;
	},
};
