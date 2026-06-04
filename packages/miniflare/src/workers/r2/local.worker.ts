import { CorePaths } from "../core/constants";

type Env = Record<string, R2Bucket>;

export default <ExportedHandler<Env>>{
	async fetch(request, env) {
		const url = new URL(request.url);
		const match = url.pathname.match(
			new RegExp(`^${CorePaths.R2_PUBLIC}/([^/]+)/(.+)$`)
		);
		if (!match) {
			return new Response("Not Found", { status: 404 });
		}
		const bucketId = decodeURIComponent(match[1]);
		const key = decodeURIComponent(match[2]);

		const bucket = env[bucketId];
		if (bucket === undefined) {
			return new Response("Not Found", { status: 404 });
		}

		if (request.method !== "GET" && request.method !== "HEAD") {
			return new Response("Method Not Allowed", {
				status: 405,
				headers: { Allow: "GET, HEAD" },
			});
		}

		const hasRange = request.headers.has("Range");
		const object =
			request.method === "HEAD"
				? await bucket.head(key)
				: await bucket.get(key, {
						onlyIf: request.headers,
						range: hasRange ? request.headers : undefined,
					});

		if (object === null) {
			return new Response("Not Found", { status: 404 });
		}

		const headers = new Headers();
		object.writeHttpMetadata(headers);
		headers.set("ETag", object.httpEtag);
		headers.set("Accept-Ranges", "bytes");

		if (request.method === "GET" && !("body" in object)) {
			const is412 =
				request.headers.has("If-Match") ||
				request.headers.has("If-Unmodified-Since");
			return new Response(null, { status: is412 ? 412 : 304, headers });
		}

		if (request.method === "HEAD") {
			headers.set("Content-Length", `${object.size}`);
			return new Response(null, { headers });
		}

		const body = object as R2ObjectBody;
		const range = body.range;
		if (
			hasRange &&
			range !== undefined &&
			"offset" in range &&
			"length" in range
		) {
			const { offset = 0, length = body.size - offset } = range;
			headers.set(
				"Content-Range",
				`bytes ${offset}-${offset + length - 1}/${body.size}`
			);
			headers.set("Content-Length", `${length}`);
			return new Response(body.body, { status: 206, headers });
		}

		headers.set("Content-Length", `${body.size}`);
		return new Response(body.body, { headers });
	},
};
