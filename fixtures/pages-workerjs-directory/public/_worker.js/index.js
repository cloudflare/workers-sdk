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

		if (pathname === "/d1") {
			const stmt = env.D1.prepare("SELECT 1");
			const values = await stmt.first();
			return new Response(JSON.stringify(values));
		}

		if (pathname !== "/") {
			return new Response((await import(`./${pathname.slice(1)}`)).default);
		}

		return env.ASSETS.fetch(request);
	},
};
