import wasm from "./minimal.wasm";

export default {
	async fetch() {
		const instance = await WebAssembly.instantiate(wasm);
		const result = instance.exports.add(3, 4);

		return new Response(result);
		// return new Response("Hello World!");
	},
} satisfies ExportedHandler;
