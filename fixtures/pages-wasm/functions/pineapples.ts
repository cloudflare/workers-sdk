import { add } from "../my-wasm-module-add.wasm";
import { multiply } from "../my-wasm-module-multiply.wasm";

export async function onRequest() {
	return new Response(`You have ${multiply(2, add(2, 3))} 🍍s left!`);
}