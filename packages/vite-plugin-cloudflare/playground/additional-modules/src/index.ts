import bin from "./bin-example.bin";
import html from "./html-example.html";
import text from "./text-example.txt";
import wasm from "./wasm-example.wasm";
import wasmWithParam from "./wasm-example.wasm?module";

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
			case "/wasm-with-param": {
				const instance = await WebAssembly.instantiate(wasmWithParam);
				const result = instance.exports.add(5, 6);

				return Response.json({ result });
			}
			default: {
				return new Response(null, { status: 404 });
			}
		}
	},
} satisfies ExportedHandler;
