declare module '*.bin' {
	const arrayBuffer: ArrayBuffer;
	export default arrayBuffer;
}

declare module '*.html' {
	const html: string
  export default html
}

declare module '*.sql' {
	const sql: string
  export default sql
}

declare module '*.md' {
	const markdown: string;
	export default markdown;
}

declare module '*.wasm' {
	const wasm: WebAssembly.Module
	export default wasm
}

declare module '*.wasm?module' {
	const wasm: WebAssembly.Module
	export default wasm
}
