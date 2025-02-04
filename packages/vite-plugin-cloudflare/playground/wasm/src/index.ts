import wasm from "./minimal.wasm";

export default {
	async fetch() {
		const instance = await WebAssembly.instantiate(wasm);
		const result = instance.exports.add(3, 4);

		return Response.json({ result });
	},
} satisfies ExportedHandler;
