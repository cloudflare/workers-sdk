import add from "./add.wasm";
import staticJsMod from "./static.js";
import staticMjsMod from "./static.mjs";

export default {
	async fetch(request, env) {
		const { pathname } = new URL(request.url);

		if (pathname === "/wasm") {
			const addModule = await WebAssembly.instantiate(add);
			return new Response(addModule.exports.add(1, 2).toString());
		}

		if (pathname === "/static-js") {
			return new Response(`static import text (via js): '${staticJsMod}'`);
		}

		if (pathname === "/static-mjs") {
			return new Response(`static import text (via mjs): '${staticMjsMod}'`);
		}

		if (pathname === "/d1") {
			const stmt1 = env.D1.prepare("SELECT 1");
			const values1 = await stmt1.first();

			const stmt = env.PUT.prepare("SELECT 1");
			const values = await stmt.first();

			if (JSON.stringify(values1) === JSON.stringify(values)) {
				return new Response(JSON.stringify(values));
			}

			return new Response("couldn't select 1");
		}

		if (pathname === "/kv") {
			await env.KV.put("key", "value");

			await env.KV_REF.put("key", "value");

			return new Response("saved");
		}

		if (pathname === "/r2") {
			await env.R2.put("key", "value");

			await env.R2_REF.put("key", "value");

			return new Response("saved");
		}

		if (pathname !== "/") {
			return new Response((await import(`./${pathname.slice(1)}`)).default);
		}

		return env.ASSETS.fetch(request);
	},
};
