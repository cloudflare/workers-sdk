import bin from "./modules/bin-example.bin";
import html from "./modules/html-example.html";
import text from "./modules/text-example.txt";
import wasm from "./modules/wasm-example.wasm";
import init from "./modules/wasm-example.wasm?init";
import wasmWithModuleParam from "./modules/wasm-example.wasm?module";

export default {
	async fetch(request) {
		const url = new URL(request.url);

		switch (url.pathname) {
			case "/bin": {
				return Response.json({ byteLength: bin.byteLength });
			}
			case "/html": {
				return new Response(html, { headers: { "Content-Type": "text/html" } });
			}
			case "/text": {
				return new Response(text, {
					headers: { "Content-Type": "text/plain" },
				});
			}
			case "/wasm": {
				const instance = await WebAssembly.instantiate(wasm);
				const result = instance.exports.add(3, 4);

				return Response.json({ result });
			}
			case "/wasm-with-module-param": {
				const instance = await WebAssembly.instantiate(wasmWithModuleParam);
				const result = instance.exports.add(5, 6);

				return Response.json({ result });
			}
			case "/wasm-with-init-param": {
				const instance = await init();
				const result = instance.exports.add(7, 8);

				return Response.json({ result });
			}
			default: {
				return new Response(null, { status: 404 });
			}
		}
	},
} satisfies ExportedHandler;
