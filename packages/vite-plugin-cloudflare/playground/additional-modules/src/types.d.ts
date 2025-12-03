declare module '*.bin' {
	const arrayBuffer: ArrayBuffer;
	export default arrayBuffer;
}

declare module '*.html' {
	const html: string
  export default html
}

declare module '*.wasm' {
	const wasm: WebAssembly.Module
	export default wasm
}

declare module '*.wasm?module' {
	const wasm: WebAssembly.Module
	export default wasm
}
