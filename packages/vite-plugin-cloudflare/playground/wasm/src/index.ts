import wasm from "./minimal.wasm";

export default {
	async fetch() {
		return new Response("Hello World!");
	},
} satisfies ExportedHandler;
