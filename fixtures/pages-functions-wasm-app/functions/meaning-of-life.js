import add from "../wasm/add.wasm";

export async function onRequest() {
	const addModule = await WebAssembly.instantiate(add);
	return new Response(
		`Hello WASM World! The meaning of life is ${addModule.exports.add(20, 1)}`
	);
}
