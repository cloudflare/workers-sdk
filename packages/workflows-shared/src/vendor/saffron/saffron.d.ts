/* Minimal hand-written types for the vendored wasm-bindgen glue (saffron.js).
 * Only the surface used by CronFetcher is declared. */

export class WasmCron {
	constructor(expression: string);
	/** Next occurrence strictly after `after_ms` (epoch ms), or undefined. */
	nextAfter(after_ms: number): number | undefined;
	free(): void;
}

export function initSync(module: { module: WebAssembly.Module }): unknown;
