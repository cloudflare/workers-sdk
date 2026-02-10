declare module "xxhash-wasm" {
	export interface XXHashAPI {
		h64ToString(input: string): string;
	}

	export default function (): XXHashAPI;
}
