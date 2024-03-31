// Minimal types for `node:*` modules provided by `nodejs_compat` flag
// TODO(soon): remove once these types are part of `@cloudflare/workers-types`

declare module "node:assert" {
	type AssertPredicate =
		| RegExp
		| (new () => object)
		| ((thrown: unknown) => boolean)
		| object
		| Error;

	function assert(value: boolean, message?: string | Error): asserts value;

	namespace assert {
		function fail(message?: string | Error): never;
		function strictEqual(
			actual: unknown,
			expected: unknown,
			message?: string | Error
		): void;
		function deepStrictEqual<T>(
			actual: unknown,
			expected: T,
			message?: string | Error
		): asserts actual is T;

		function throws(
			block: () => unknown,
			error: AssertPredicate,
			message?: string | Error
		): void;
		function rejects(
			block: (() => Promise<unknown>) | Promise<unknown>,
			error: AssertPredicate,
			message?: string | Error
		): Promise<void>;
	}

	export default assert;
}

declare module "node:buffer" {
	// @ts-expect-error `Buffer.from()` is incompatible with `Uint8Array.from()`
	export class Buffer extends Uint8Array {
		static from(
			value: ArrayLike<number> | ArrayBuffer | string,
			encoding?: string
		): Buffer;
		static alloc(length: number): Buffer;
		static byteLength(value: string, encoding?: string): number;
		static concat(buffers: Uint8Array[], totalLength?: number): Buffer;

		compare(
			target: Uint8Array,
			targetStart?: number,
			targetEnd?: number,
			sourceStart?: number,
			sourceEnd?: number
		): number;
		copy(
			target: Uint8Array,
			targetStart?: number,
			sourceStart?: number,
			sourceEnd?: number
		): number;
		equals(other: Uint8Array): boolean;
		fill(value: number, offset?: number, end?: number): this;
		fill(value: string, encoding?: string): this;
		fill(value: string, offset?: number, end?: number, encoding?: string): this;
		fill(value: Uint8Array, offset?: number, end?: number): this;
		includes(value: number, byteOffset?: number): boolean;
		includes(value: string, encoding?: string): boolean;
		includes(value: string, byteOffset?: number, encoding?: string): boolean;
		includes(value: Uint8Array, byteOffset?: number): boolean;
		indexOf(value: number, byteOffset?: number): number;
		indexOf(value: string, encoding?: string): number;
		indexOf(value: string, byteOffset?: number, encoding?: string): number;
		indexOf(value: Uint8Array, byteOffset?: number): number;
		lastIndexOf(value: number, byteOffset?: number): number;
		lastIndexOf(value: string, encoding?: string): number;
		lastIndexOf(value: string, byteOffset?: number, encoding?: string): number;
		lastIndexOf(value: Uint8Array, byteOffset?: number): number;
		readBigInt64BE(offset?: number): bigint;
		readBigInt64LE(offset?: number): bigint;
		readBigUint64BE(offset?: number): bigint;
		readBigUint64LE(offset?: number): bigint;
		readDoubleBE(offset?: number): number;
		readDoubleLE(offset?: number): number;
		readFloatBE(offset?: number): number;
		readFloatLE(offset?: number): number;
		readInt8(offset?: number): number;
		readInt16BE(offset?: number): number;
		readInt16LE(offset?: number): number;
		readInt32BE(offset?: number): number;
		readInt32LE(offset?: number): number;
		readIntBE(offset?: number, byteLength?: number): number;
		readIntLE(offset?: number, byteLength?: number): number;
		readUint8(offset?: number): number;
		readUint16BE(offset?: number): number;
		readUint16LE(offset?: number): number;
		readUint32BE(offset?: number): number;
		readUint32LE(offset?: number): number;
		readUintBE(offset?: number, byteLength?: number): number;
		readUintLE(offset?: number, byteLength?: number): number;
		swap16(): this;
		swap32(): this;
		swap64(): this;
		toJSON(): { type: "Buffer"; data: number[] };
		toString(encoding?: string, start?: number, end?: number): string;
		write(string: string, encoding?: string): number;
		write(string: string, offset?: number, encoding?: string): number;
		write(
			string: string,
			offset?: number,
			length?: number,
			encoding?: string
		): number;
		writeBigInt64BE(value: bigint, offset?: number): number;
		writeBigInt64LE(value: bigint, offset?: number): number;
		writeBigUint64BE(value: bigint, offset?: number): number;
		writeBigUint64LE(value: bigint, offset?: number): number;
		writeDoubleBE(value: number, offset?: number): number;
		writeDoubleLE(value: number, offset?: number): number;
		writeFloatBE(value: number, offset?: number): number;
		writeFloatLE(value: number, offset?: number): number;
		writeInt8(value: number, offset?: number): number;
		writeInt16BE(value: number, offset?: number): number;
		writeInt16LE(value: number, offset?: number): number;
		writeInt32BE(value: number, offset?: number): number;
		writeInt32LE(value: number, offset?: number): number;
		writeIntBE(value: number, offset?: number, byteLength?: number): number;
		writeIntLE(value: number, offset?: number, byteLength?: number): number;
		writeUint8(value: number, offset?: number): number;
		writeUint16BE(value: number, offset?: number): number;
		writeUint16LE(value: number, offset?: number): number;
		writeUint32BE(value: number, offset?: number): number;
		writeUint32LE(value: number, offset?: number): number;
		writeUintBE(value: number, offset?: number, byteLength?: number): number;
		writeUintLE(value: number, offset?: number, byteLength?: number): number;
	}
}

declare module "node:crypto" {
	import { Buffer } from "node:buffer";

	class Hash {
		update(data: string | ArrayBufferView): Hash;
		update(data: string, encoding: string): Hash;
		digest(): Buffer;
		digest(encoding: string): string;
	}

	export function createHash(algorithm: string): Hash;
}

interface SymbolConstructor {
	readonly dispose: unique symbol;
}
