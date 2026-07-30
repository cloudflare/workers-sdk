// Lets the vendored WASM be imported as a compiled module (wrangler/miniflare
// resolve `.wasm` imports to a `WebAssembly.Module`).
declare module "*.wasm" {
	const wasmModule: WebAssembly.Module;
	export default wasmModule;
}
