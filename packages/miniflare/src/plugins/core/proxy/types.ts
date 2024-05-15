import { Blob } from "buffer";
import { arrayBuffer } from "stream/consumers";
import { ReadableStream } from "stream/web";
import { File, Headers } from "undici";
import { Request, RequestInit, Response } from "../../../http";
import { PlatformImpl } from "../../../workers";
import type {
	AbortSignal as WorkerAbortSignal,
	Blob as WorkerBlob,
	File as WorkerFile,
	Headers as WorkerHeaders,
	ReadableStream as WorkerReadableStream,
	Request as WorkerRequest,
	RequestInit as WorkerRequestInit,
	Response as WorkerResponse,
} from "@cloudflare/workers-types/experimental";

export const NODE_PLATFORM_IMPL: PlatformImpl<ReadableStream> = {
	// Node's implementation of these classes don't quite match Workers',
	// but they're close enough for us
	Blob: Blob as unknown as typeof WorkerBlob,
	File: File as unknown as typeof WorkerFile,
	Headers: Headers as unknown as typeof WorkerHeaders,
	Request: Request as unknown as typeof WorkerRequest,
	Response: Response as unknown as typeof WorkerResponse,

	isReadableStream(value): value is ReadableStream {
		return value instanceof ReadableStream;
	},
	bufferReadableStream(stream) {
		return arrayBuffer(stream);
	},
	unbufferReadableStream(buffer) {
		return new Blob([new Uint8Array(buffer)]).stream();
	},
};

// Substitutes workers types with the corresponding Node implementations.
// prettier-ignore
export type ReplaceWorkersTypes<T> =
  T extends WorkerRequest ? Request :
  T extends WorkerResponse ? Response :
  T extends WorkerReadableStream ? ReadableStream :
  Required<T> extends Required<WorkerRequestInit> ? RequestInit :
  T extends WorkerHeaders ? Headers :
  T extends WorkerBlob ? Blob :
  T extends WorkerAbortSignal ? AbortSignal :
  T extends Promise<infer P> ? Promise<ReplaceWorkersTypes<P>> :
  T extends (...args: infer P) => infer R ? (...args: ReplaceWorkersTypes<P>) => ReplaceWorkersTypes<R> :
  T extends object ? { [K in keyof T]: OverloadReplaceWorkersTypes<T[K]> } :
  T;

export type OverloadReplaceWorkersTypes<T> = T extends (...args: any[]) => any
	? UnionToIntersection<ReplaceWorkersTypes<OverloadUnion<T>>>
	: ReplaceWorkersTypes<T>;

export type UnionToIntersection<U> = (
	U extends any ? (k: U) => void : never
) extends (k: infer I) => void
	? I
	: never;

export type OverloadUnion2<T> = T extends {
	(...args: infer P1): infer R1;
	(...args: infer P2): infer R2;
}
	? ((...args: P1) => R1) | ((...args: P2) => R2)
	: T;

export type OverloadUnion3<T> = T extends {
	(...args: infer P1): infer R1;
	(...args: infer P2): infer R2;
	(...args: infer P3): infer R3;
}
	? ((...args: P1) => R1) | ((...args: P2) => R2) | ((...args: P3) => R3)
	: OverloadUnion2<T>;

export type OverloadUnion4<T> = T extends {
	(...args: infer P1): infer R1;
	(...args: infer P2): infer R2;
	(...args: infer P3): infer R3;
	(...args: infer P4): infer R4;
}
	?
			| ((...args: P1) => R1)
			| ((...args: P2) => R2)
			| ((...args: P3) => R3)
			| ((...args: P4) => R4)
	: OverloadUnion3<T>;

export type OverloadUnion5<T> = T extends {
	(...args: infer P1): infer R1;
	(...args: infer P2): infer R2;
	(...args: infer P3): infer R3;
	(...args: infer P4): infer R4;
	(...args: infer P5): infer R5;
}
	?
			| ((...args: P1) => R1)
			| ((...args: P2) => R2)
			| ((...args: P3) => R3)
			| ((...args: P4) => R4)
			| ((...args: P5) => R5)
	: OverloadUnion4<T>;

export type OverloadUnion6<T> = T extends {
	(...args: infer P1): infer R1;
	(...args: infer P2): infer R2;
	(...args: infer P3): infer R3;
	(...args: infer P4): infer R4;
	(...args: infer P5): infer R5;
	(...args: infer P6): infer R6;
}
	?
			| ((...args: P1) => R1)
			| ((...args: P2) => R2)
			| ((...args: P3) => R3)
			| ((...args: P4) => R4)
			| ((...args: P5) => R5)
			| ((...args: P6) => R6)
	: OverloadUnion5<T>;

export type OverloadUnion7<T> = T extends {
	(...args: infer P1): infer R1;
	(...args: infer P2): infer R2;
	(...args: infer P3): infer R3;
	(...args: infer P4): infer R4;
	(...args: infer P5): infer R5;
	(...args: infer P6): infer R6;
	(...args: infer P7): infer R7;
}
	?
			| ((...args: P1) => R1)
			| ((...args: P2) => R2)
			| ((...args: P3) => R3)
			| ((...args: P4) => R4)
			| ((...args: P5) => R5)
			| ((...args: P6) => R6)
			| ((...args: P7) => R7)
	: OverloadUnion6<T>;

export type OverloadUnion8<T> = T extends {
	(...args: infer P1): infer R1;
	(...args: infer P2): infer R2;
	(...args: infer P3): infer R3;
	(...args: infer P4): infer R4;
	(...args: infer P5): infer R5;
	(...args: infer P6): infer R6;
	(...args: infer P7): infer R7;
	(...args: infer P8): infer R8;
}
	?
			| ((...args: P1) => R1)
			| ((...args: P2) => R2)
			| ((...args: P3) => R3)
			| ((...args: P4) => R4)
			| ((...args: P5) => R5)
			| ((...args: P6) => R6)
			| ((...args: P7) => R7)
			| ((...args: P8) => R8)
	: OverloadUnion7<T>;

// `KVNamespace#{get,getWithMetadata}()` each have 9 overloads :D
export type OverloadUnion9<T> = T extends {
	(...args: infer P1): infer R1;
	(...args: infer P2): infer R2;
	(...args: infer P3): infer R3;
	(...args: infer P4): infer R4;
	(...args: infer P5): infer R5;
	(...args: infer P6): infer R6;
	(...args: infer P7): infer R7;
	(...args: infer P8): infer R8;
	(...args: infer P9): infer R9;
}
	?
			| ((...args: P1) => R1)
			| ((...args: P2) => R2)
			| ((...args: P3) => R3)
			| ((...args: P4) => R4)
			| ((...args: P5) => R5)
			| ((...args: P6) => R6)
			| ((...args: P7) => R7)
			| ((...args: P8) => R8)
			| ((...args: P9) => R9)
	: OverloadUnion8<T>;

export type OverloadUnion<T extends (...args: any[]) => any> =
	// Functions with no parameters pass the `extends` checks in the
	// `OverloadUnionN` types with `(...args: unknown[]) => unknown` for the
	// other overloads. Therefore, filter them out early.
	Parameters<T> extends [] ? T : OverloadUnion9<T>;
