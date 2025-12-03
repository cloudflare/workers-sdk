import { a } from "./a";

export default {
	async fetch(request) {
		const url = new URL(request.url);

		if (
			url.pathname ===
			// doing base path normalization, in real world you would built in framework features from libs like Hono
			`${import.meta.env.BASE_URL}/x-forwarded-host`.replace(/\/+/g, "/")
		) {
			return new Response(request.headers.get("X-Forwarded-Host"));
		}

		// return the pathname if the path parameter is present to test the base path
		if (url.searchParams.has("path")) {
			return new Response(url.pathname);
		}

		console.log(a);
		const { fn } = await import("./b");
		fn();

		console.debug("__console debug__");
		console.log("__console log__");
		console.warn("__console warn__");
		console.error("__console error__");

		return new Response("Hello World!");
	},
} satisfies ExportedHandler;

addEventListener("unhandledrejection", () => {
	console.error("__unhandled rejection__");
});
