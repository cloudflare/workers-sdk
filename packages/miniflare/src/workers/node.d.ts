// Minimal types for `node:*` modules provided by `nodejs_compat` flag
// TODO(soon): remove once these types are part of `@cloudflare/workers-types`

declare module "node:assert" {
	export default function (value: boolean): asserts value;
}

declare module "node:buffer" {
	// @ts-expect-error `Buffer.from()` is incompatible with `Uint8Array.from()`
	export class Buffer extends Uint8Array {
		static from(
			value: ArrayLike<number> | ArrayBuffer | string,
			encoding?: string
		): Buffer;
		toString(encoding?: string): string;
	}
}
