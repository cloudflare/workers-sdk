import { add } from "../my-wasm-module-add.wasm";
import { multiply } from "../my-wasm-module-multiply.wasm";
import { Pineapple } from "pineapple.wasm";

export default {
	async fetch(request, env) {
		const url = new URL(request.url);
		if (url.pathname.startsWith("/math/add")) {
			return new Response(add(2, 2));
		}

		if (url.pathname.startsWith("/math/multiply")) {
			return new Response(multiply(3, 3));
		}

		if (url.pathname.startsWith("/pineapples")) {
			return new Response(Pineapple("🍍"));
		}

		return env.ASSETS.fetch(request);
	},
};
