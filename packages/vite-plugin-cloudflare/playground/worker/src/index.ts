import { a } from "./a";

export default {
	async fetch(request) {
		const url = new URL(request.url);

		if (url.pathname === "/x-forwarded-host") {
			return new Response(request.headers.get("X-Forwarded-Host"));
		}

		console.log(a);
		const { fn } = await import("./b");
		fn();

		console.log("__console log__");
		console.warn("__console warn__");
		console.error("__console error__");

		return new Response("Hello World!");
	},
} satisfies ExportedHandler;

addEventListener("unhandledrejection", (event) => {
	console.error("__unhandled rejection__");
});
