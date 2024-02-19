import html from "./../external-modules/meaning-of-life.html";
import multiply from "./../wasm/multiply.wasm";

export default {
	async fetch(request, env) {
		const url = new URL(request.url);
		const multiplyModule = await WebAssembly.instantiate(multiply);

		if (url.pathname === "/meaning-of-life-wasm") {
			return new Response(
				`[.wasm]: The meaning of life is ${multiplyModule.exports.multiply(
					7,
					3
				)}`
			);
		}

		if (url.pathname === "/meaning-of-life-html") {
			return new Response(html, {
				headers: {
					"Content-Type": "text/html",
				},
			});
		}

		return env.ASSETS.fetch(request);
	},
};
