import { now } from "./dep";
import { randomBytes } from "isomorphic-random-example";

/** @param {Uint8Array} array */
function hexEncode(array) {
	return Array.from(array)
		.map((x) => x.toString(16).padStart(2, "0"))
		.join("");
}

export default {
	async fetch(request) {
		const { pathname } = new URL(request.url);
		if (pathname === "/random") return new Response(hexEncode(randomBytes(8)));

		console.log(
			request.method,
			request.url,
			new Map([...request.headers]),
			request.cf
		);

		await fetch(new URL("https://example.com"));
		await fetch(
			new Request("https://example.com", { method: "POST", body: "foo" })
		);

		return new Response(`${request.url} ${now()}`);
	},

	/**
	 * Handle a scheduled event.
	 *
	 * If developing using `--local` mode, you can trigger this scheduled event via a CURL.
	 * E.g. `curl "http://localhost:8787/cdn-cgi/mf/scheduled"`.
	 * See the Miniflare docs: https://miniflare.dev/core/scheduled.
	 */
	scheduled(event, env, ctx) {
		ctx.waitUntil(Promise.resolve(event.scheduledTime));
		ctx.waitUntil(Promise.resolve(event.cron));
	},
};

// addEventListener("fetch", (event) => {
//   event.respondWith(handleRequest(event.request));
// });

// async function handleRequest(request) {
//   return new Response("Hello worker!", {
//     headers: { "content-type": "text/plain" },
//   });
// }
