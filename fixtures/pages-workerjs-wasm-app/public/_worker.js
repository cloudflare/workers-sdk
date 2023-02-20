import multiply from "./../wasm/multiply.wasm";

export default {
	async fetch(request, env) {
		const url = new URL(request.url);
		const multiplyModule = await WebAssembly.instantiate(multiply);

		if (url.pathname === "/meaning-of-life") {
			return new Response(
				`Hello _worker.js WASM World! The meaning of life is ${multiplyModule.exports.multiply(
					7,
					3
				)}`
			);
		}

		return env.ASSETS.fetch(request);
	},
};
