import assert from "node:assert";
import { Buffer } from "node:buffer";
import {
	parseWithReadableStreams,
	PlatformImpl,
	prefixStream,
	readPrefix,
	stringifyWithStreams,
} from "./miniflare";

// This file implements `devalue` reducers and revivers for structured-
// serialisable types not supported by default. See serialisable types here:
// https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm#supported_types

export type ReducerReviver = (value: unknown) => unknown;
export type ReducersRevivers = Record<string, ReducerReviver>;

function isObject(
	value: unknown
): value is Record<string | number | symbol, unknown> {
	return !!value && typeof value === "object";
}

function isInternal(
	value: unknown
): value is Record<string | number | symbol, unknown> {
	return isObject(value) && !!value[Symbol.for("cloudflare:internal-class")];
}

/**
 * Some Cloudflare bindings APIs have _synchronous_ methods. This is tricky!
 * We need to be able to pass these across the async RPC boundary, and we need
 * users to be able to call them on the client side as synchronous methods.
 * Fortunately, all the synchronous methods that I've come across so far can be
 * pre-computed on the server and then reconstructed from the result on the client
 *
 * This is a class so that serialisation/de-serialisation can be handled easily
 * with devalue below
 */
class SynchronousMethod {
	constructor(
		public name: string,
		public method: (...args: any[]) => any
	) {}
}
const synchronousMethods: Record<
	string,
	{
		reduce: (fn: (...input: any[]) => any) => any;
		revive: (serialised: any) => (...input: any[]) => unknown;
	}
> = {
	"Checksums::toJSON": {
		reduce: (fn: () => unknown) => fn(),
		revive: (v: unknown) => () => v,
	},
	"HeadResult::writeHttpMetadata": {
		reduce: (fn: (headers: Headers) => void) => {
			const h = new Headers();
			fn(h);
			return h;
		},
		revive: (v: Headers) => (headers: Headers) => {
			for (const [name, value] of v.entries()) {
				headers.set(name, value);
			}
		},
	},
	"GetResult::writeHttpMetadata": {
		reduce: (fn: (headers: Headers) => void) => {
			const h = new Headers();
			fn(h);
			return h;
		},
		revive: (v: Headers) => (headers: Headers) => {
			for (const [name, value] of v.entries()) {
				headers.set(name, value);
			}
		},
	},
};

export type ChainItem =
	| {
			type: "get";
			property: string | symbol;
	  }
	| {
			type: "apply";
			arguments: string[];
	  };

export class UnresolvedChain {
	constructor(
		public chainProxy: { chain: ChainItem[]; targetHeapId: unknown }
	) {}
}

export function createCloudflareReducers(
	heap?: Map<string, unknown>
): ReducersRevivers {
	return {
		RpcStub(val) {
			if (
				val !== null &&
				typeof val === "object" &&
				val.constructor.name === "RpcStub" &&
				heap
			) {
				const id = crypto.randomUUID();
				if (!heap) {
					throw new Error("Attempted to use heap on client");
				}

				heap.set(id, val);
				return id;
			}
		},
		UnresolvedChain(val) {
			if (val instanceof UnresolvedChain) {
				return val.chainProxy;
			}
		},
		/**
		 * Internal classes are things like R2Object, which have some properties, synchronous methods, and optionally a stream
		 */
		InternalClass(val) {
			if (isInternal(val)) {
				let stream: ReadableStream | undefined = undefined;
				if (val.body instanceof ReadableStream) {
					stream = val.body;
				}

				return [
					// These classes are not constructable in userland, but we need to make the constructor name
					// match in case user-code depends
					val.constructor.name,
					{
						...val,
						...Object.fromEntries(
							Object.keys(val)
								.filter(
									(m) => !!synchronousMethods[`${val.constructor.name}::${m}`]
								)
								.map((m) => [
									m,
									new SynchronousMethod(
										`${val.constructor.name}::${m}`,
										val[m] as () => void
									),
								])
						),
					},
					stream,
				];
			}
		},
		SynchronousMethod(val) {
			if (val instanceof SynchronousMethod) {
				return [val.name, synchronousMethods[val.name].reduce(val.method)];
			}
		},
	};
}

export function createCloudflareRevivers(
	heap?: Map<string, unknown>,
	stubProxy?: (id: string) => unknown
): ReducersRevivers {
	return {
		RpcStub(id: unknown) {
			if (typeof id !== "string") {
				throw new Error("RpcStub with wrong ID");
			}

			if (heap) {
				return heap.get(id);
			} else {
				if (stubProxy === undefined) {
					throw new Error("Can't inflate RpcStub");
				}
				return stubProxy(id);
			}
		},
		UnresolvedChain(val) {
			if (stubProxy) {
				return stubProxy(val.targetHeapId);
			}
			// @ts-expect-error this is fine
			return new UnresolvedChain(val);
		},
		InternalClass(val) {
			const kls = {};
			Object.defineProperty(kls.constructor, "name", {
				// @ts-expect-error this is fine
				value: val[0],
				writable: false,
			});
			// @ts-expect-error this is fine
			Object.assign(kls, val[1]);
			// @ts-expect-error this is fine
			if (val[2]) {
				// @ts-expect-error this is fine
				const r = new Response(val[2]);
				Object.assign(kls, {
					body: r.body,
					bodyUsed: r.bodyUsed,
					json: r.json.bind(r),
					arrayBuffer: r.arrayBuffer.bind(r),
					text: r.text.bind(r),
					blob: r.blob.bind(r),
				});
			}
			return kls;
		},
		SynchronousMethod(val) {
			assert(Array.isArray(val));
			return synchronousMethods[val[0]].revive(val[1]);
		},
	};
}

export const WORKERS_PLATFORM_IMPL: PlatformImpl<ReadableStream> = {
	Blob,
	File,
	Headers,
	Request,
	Response,

	isReadableStream(value): value is ReadableStream {
		return value instanceof ReadableStream;
	},
	bufferReadableStream(stream) {
		return new Response(stream).arrayBuffer();
	},
	unbufferReadableStream(buffer) {
		const body = new Response(buffer).body;
		assert(body !== null);
		return body;
	},
};

const decoder = new TextDecoder();

const SIZE_HEADER = "X-Buffer-Size";
export async function parse<T>(
	serialised: Request | Response,
	revivers: ReducersRevivers
): Promise<T> {
	let unbufferedStream: ReadableStream | undefined;
	const stringifiedSizeHeader = serialised.headers.get(SIZE_HEADER);
	if (
		stringifiedSizeHeader === null ||
		stringifiedSizeHeader === serialised.headers.get("Content-Length")
	) {
		// No unbuffered `ReadableStream`
		return parseWithReadableStreams(
			WORKERS_PLATFORM_IMPL,
			{ value: await serialised.text() },
			revivers
		) as T;
	} else {
		// Unbuffered `ReadableStream` argument
		const argsSize = parseInt(stringifiedSizeHeader);
		assert(!Number.isNaN(argsSize));
		assert(serialised.body !== null);
		const [encodedArgs, rest] = await readPrefix(serialised.body, argsSize);
		unbufferedStream = rest;
		const stringifiedArgs = decoder.decode(encodedArgs);
		return parseWithReadableStreams(
			WORKERS_PLATFORM_IMPL,
			{ value: stringifiedArgs, unbufferedStream: rest },
			revivers
		) as T;
	}
}

async function writeWithUnbufferedStream(
	writable: WritableStream,
	encodedValue: Uint8Array,
	unbufferedStream: ReadableStream
) {
	const writer = writable.getWriter();
	await writer.write(encodedValue);
	writer.releaseLock();
	await unbufferedStream.pipeTo(writable);
}

const encoder = new TextEncoder();
export async function serialiseToResponse(
	data: unknown,
	reducers: ReducersRevivers
) {
	const stringified = await stringifyWithStreams(
		WORKERS_PLATFORM_IMPL,
		data,
		reducers,
		true
	);
	if (stringified.unbufferedStream === undefined) {
		return new Response(stringified.value);
	} else {
		const body = new IdentityTransformStream();
		const encodedValue = encoder.encode(stringified.value);
		const encodedSize = encodedValue.byteLength.toString();
		void writeWithUnbufferedStream(
			body.writable,
			encodedValue,
			stringified.unbufferedStream
		);
		return new Response(body.readable, {
			headers: {
				[SIZE_HEADER]: encodedSize,
			},
		});
	}
}
export async function serialiseToRequest(
	data: unknown,
	reducers: ReducersRevivers
) {
	const stringified = await stringifyWithStreams(
		WORKERS_PLATFORM_IMPL,
		data,
		reducers,
		true
	);
	if (stringified.unbufferedStream === undefined) {
		const size = Buffer.byteLength(stringified.value).toString();
		return new Request("http://example.com", {
			method: "POST",
			headers: {
				[SIZE_HEADER]: size,
				"Content-Length": size,
			},
			body: stringified.value,
		});
	} else {
		const body = new IdentityTransformStream();
		const encodedValue = encoder.encode(stringified.value);
		const encodedSize = encodedValue.byteLength.toString();
		void writeWithUnbufferedStream(
			body.writable,
			encodedValue,
			stringified.unbufferedStream
		);
		return new Request("http://example.com", {
			method: "POST",
			headers: {
				[SIZE_HEADER]: encodedSize,
			},
			body: body.readable,
		});
	}
}
