import { multiply } from "../../my-wasm-module-multiply.wasm";

export async function onRequest() {
	return new Response(multiply(2, 5));
}

