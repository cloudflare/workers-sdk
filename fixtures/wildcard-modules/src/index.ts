import common from "./common.cjs";
import dep from "./dep";
import text from "./text.txt";

export default <ExportedHandler>{
	async fetch(request) {
		const url = new URL(request.url);
		if (url.pathname === "/dep") {
			return new Response(dep);
		}
		if (url.pathname === "/text") {
			return new Response(text);
		}
		if (url.pathname === "/common") {
			return new Response(common);
		}
		if (url.pathname === "/dynamic") {
			return new Response((await import("./dynamic.js")).default);
		}
		if (url.pathname.startsWith("/lang/")) {
			// Build the path dynamically to ensure esbuild does a wildcard import
			return new Response(
				(
					await import(
						"./lang/" + url.pathname.substring("/lang/".length) + ".js"
					)
				).default.hello
			);
		}
		return new Response("Not Found", { status: 404 });
	},
};
