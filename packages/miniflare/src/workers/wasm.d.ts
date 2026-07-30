// Lets embedded workers import `.wasm` as a compiled module (used by the
// vendored saffron parser in workflows/saffron.worker.ts).
declare module "*.wasm" {
	const wasmModule: WebAssembly.Module;
	export default wasmModule;
}
