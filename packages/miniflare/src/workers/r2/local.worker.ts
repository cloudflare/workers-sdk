import { Hono } from "hono/tiny";
import { CorePaths } from "../core/constants";

type Env = Record<string, R2Bucket>;

const app = new Hono<{ Bindings: Env }>().basePath(CorePaths.R2_PUBLIC);

app.on(["GET", "HEAD"], "/:bucketId/:key{.+}", async (c) => {
	const bucketId = decodeURIComponent(c.req.param("bucketId"));
	const key = decodeURIComponent(c.req.param("key"));

	const bucket = c.env[bucketId];
	if (bucket === undefined) {
		return c.notFound();
	}

	const hasRange = c.req.header("Range") !== undefined;
	const object =
		c.req.method === "HEAD"
			? await bucket.head(key)
			: await bucket.get(key, {
					onlyIf: c.req.raw.headers,
					range: hasRange ? c.req.raw.headers : undefined,
				});

	if (object === null) {
		return c.notFound();
	}

	const headers = new Headers();
	object.writeHttpMetadata(headers);
	headers.set("ETag", object.httpEtag);
	headers.set("Accept-Ranges", "bytes");

	if (c.req.method === "GET" && !("body" in object)) {
		const is412 =
			c.req.header("If-Match") !== undefined ||
			c.req.header("If-Unmodified-Since") !== undefined;
		return c.body(null, { status: is412 ? 412 : 304, headers });
	}

	if (c.req.method === "HEAD") {
		headers.set("Content-Length", `${object.size}`);
		return c.body(null, { headers });
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
		return c.body(body.body, { status: 206, headers });
	}

	headers.set("Content-Length", `${body.size}`);
	return c.body(body.body, { headers });
});

app.all("/:bucketId/:key{.+}", (c) =>
	c.text("Method Not Allowed", 405, { Allow: "GET, HEAD" })
);

export default app;
