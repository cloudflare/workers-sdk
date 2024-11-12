import cookie from "cookie";
import { randomBytes } from "isomorphic-random-example";
import { now } from "./dep";
import { logErrors } from "./log";

console.log("startup log");

console.log("The following error is a fake for testing");
console.error(
	"*** Received structured exception #0xc0000005: access violation; stack: 7ffe71872f57 7ff7834b643b 7ff7834b643b"
);

/** @param {Uint8Array} array */
function hexEncode(array) {
	return Array.from(array)
		.map((x) => x.toString(16).padStart(2, "0"))
		.join("");
}

export default {
	async fetch(request, env) {
		console.log("request log");

		const { pathname, origin, hostname, host } = new URL(request.url);
		if (pathname.startsWith("/fav"))
			return new Response("Not found", { status: 404 });
		if (pathname === "/version_metadata") return Response.json(env.METADATA);
		if (pathname === "/random") return new Response(hexEncode(randomBytes(8)));
		if (pathname === "/error") throw new Error("Oops!");
		if (pathname === "/redirect") return Response.redirect(`${origin}/foo`);
		if (pathname === "/cookie")
			return new Response("", {
				headers: [
					[
						"Set-Cookie",
						cookie.serialize("hello", "world", {
							domain: hostname,
						}),
					],
					[
						"Set-Cookie",
						cookie.serialize("hello2", "world2", {
							domain: host,
							secure: true,
						}),
					],
				],
			});

		if (pathname === "/content-encoding") {
			return Response.json({
				AcceptEncoding: request.headers.get("Accept-Encoding"),
				clientAcceptEncoding: request.cf.clientAcceptEncoding,
			});
		}
		if (pathname === "/content-encoding/gzip") {
			return new Response("x".repeat(100), {
				headers: { "Content-Encoding": "gzip" },
			});
		}

		if (request.headers.get("X-Test-URL") !== null) {
			return new Response(request.url);
		}

		console.log("METHOD =", request.method);
		console.log("URL = ", request.url);
		console.log("HEADERS =", new Map([...request.headers]));
		console.log("CF =", request.cf);

		logErrors();

		await fetch(new URL("http://example.com"));
		await fetch(
			new Request("http://example.com", { method: "POST", body: "foo" })
		);

		console.log("end of request");
		return new Response(
			`${request.url} ${now()} HOST:${request.headers.get(
				"Host"
			)} ORIGIN:${request.headers.get("Origin")}`
		);
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
