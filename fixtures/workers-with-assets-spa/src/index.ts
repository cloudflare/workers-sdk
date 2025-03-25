export default {
	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);
		if (url.pathname === "/api/math") {
			return new Response(`1 + 1 = ${1 + 1}`);
		}
		if (url.pathname === "/api/json") {
			return Response.json({ hello: "world" });
		}
		if (url.pathname === "/api/html") {
			return new Response("<h1>Hello, world!</h1>", {
				headers: { "Content-Type": "text/html" },
			});
		}
		if (url.pathname === "/shadowed-by-spa") {
			return new Response("nope");
		}
		if (url.pathname === "/shadowed-by-asset.txt") {
			return new Response("nope");
		}

		return new Response("nope", { status: 404 });
	},
};
