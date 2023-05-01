import staticMod from "./static.js";
import add from "./add.wasm";

export default {
	async fetch(request, env) {
		const { pathname } = new URL(request.url);

		if (pathname === "/wasm") {
			const addModule = await WebAssembly.instantiate(add);
			return new Response(addModule.exports.add(1, 2).toString());
		}

		if (pathname === "/static") {
			return new Response(staticMod);
		}

		if (pathname !== "/") {
			return new Response((await import(`./${pathname.slice(1)}`)).default);
		}

		return env.ASSETS.fetch(request);
	},
};
