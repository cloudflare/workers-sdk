import { sayHello } from "./say-hello.js";
import cjs from "./say-hello.cjs";

import { johnSmith } from "./nested/index.js";
import WASM from "./simple.wasm";
import nestedWasm from "./nested/simple.wasm";

import text from "./data.txt";
import binData from "./data.bin";
export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);
		if (url.pathname === "/dynamic") {
			return new Response(`${(await import("./dynamic.js")).default}`);
		}
		if (url.pathname === "/wasm") {
			return new Response(
				await new Promise(async (resolve) => {
					const moduleImport = {
						imports: {
							imported_func(arg) {
								resolve(arg);
							},
						},
					};
					const module1 = await WebAssembly.instantiate(WASM, moduleImport);
					module1.exports.exported_func();
				})
			);
		}
		if (url.pathname === "/wasm-nested") {
			return new Response(
				await new Promise(async (resolve) => {
					const moduleImport = {
						imports: {
							imported_func(arg) {
								resolve("nested" + arg);
							},
						},
					};
					const m = await WebAssembly.instantiate(nestedWasm, moduleImport);
					m.exports.exported_func();
				})
			);
		}
		if (url.pathname === "/wasm-dynamic") {
			return new Response(
				`${await (await import("./nested/index.js")).loadWasm()}`
			);
		}

		if (url.pathname.startsWith("/lang")) {
			const language = url.pathname.split("/lang/")[1];
			return new Response(
				`${JSON.parse((await import(`./lang/${language}`)).default).hello}`
			);
		}

		if (url.pathname === "/txt") {
			return new Response(text);
		}
		if (url.pathname === "/bin") {
			return new Response(binData);
		}
		if (url.pathname === "/cjs") {
			return new Response(
				`CJS: ${cjs.sayHello("Jane Smith")} and ${johnSmith}`
			);
		}
		if (url.pathname === "/cjs-loop") {
			return new Response(`CJS: ${cjs.loop}`);
		}
		return new Response(`${sayHello("Jane Smith")} and ${johnSmith}`);
	},
};
