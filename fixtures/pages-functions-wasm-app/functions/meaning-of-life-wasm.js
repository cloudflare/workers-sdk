import add from "../external-modules/add.wasm";

export async function onRequest() {
	const addModule = await WebAssembly.instantiate(add);
	return new Response(
		`[.wasm]: The meaning of life is ${addModule.exports.add(20, 1)}`
	);
}
