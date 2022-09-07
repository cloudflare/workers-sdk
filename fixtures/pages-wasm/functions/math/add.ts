import { add } from "../../my-wasm-module-add.wasm";

export async function onRequest() {
	return new Response(add(3, 4));
}