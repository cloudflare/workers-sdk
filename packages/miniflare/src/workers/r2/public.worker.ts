import { cors } from "hono/cors";
import { Hono } from "hono/tiny";
import { CorePaths } from "../core/constants";

type Env = Record<string, R2Bucket>;

const app = new Hono<{ Bindings: Env }>().basePath(CorePaths.R2_PUBLIC);

app.use(
	cors({ origin: "*", allowMethods: ["GET", "HEAD"], exposeHeaders: ["*"] })
);

app.on(["GET", "HEAD"], "/:bucketId/:key{.+}", async (c) => {
	const bucketId = decodeURIComponent(c.req.param("bucketId"));
	const key = decodeURIComponent(c.req.param("key"));

	const bucket = c.env[bucketId];
	if (bucket === undefined) {
		return c.notFound();
	}

	const hasRange = c.req.header("Range") !== undefined;
	// `bucket.head()` cannot evaluate conditional headers (the R2 head
	// operation only carries the key), so HEAD also uses `bucket.get()` and
	// discards the body.
	const object = await bucket.get(key, {
		onlyIf: c.req.raw.headers,
		range: hasRange && c.req.method === "GET" ? c.req.raw.headers : undefined,
	});

	if (object === null) {
		return c.notFound();
	}

	const headers = new Headers();
	object.writeHttpMetadata(headers);
	headers.set("ETag", object.httpEtag);
	headers.set("Last-Modified", object.uploaded.toUTCString());
	headers.set("Accept-Ranges", "bytes");

	if (!("body" in object)) {
		const is412 =
			c.req.header("If-Match") !== undefined ||
			c.req.header("If-Unmodified-Since") !== undefined;
		return c.body(null, { status: is412 ? 412 : 304, headers });
	}

	if (c.req.method === "HEAD") {
		headers.set("Content-Length", `${object.size}`);
		return c.body(null, { headers });
	}

	const range = object.range;
	if (
		hasRange &&
		range !== undefined &&
		"offset" in range &&
		"length" in range
	) {
		const { offset = 0, length = object.size - offset } = range;
		headers.set(
			"Content-Range",
			`bytes ${offset}-${offset + length - 1}/${object.size}`
		);
		headers.set("Content-Length", `${length}`);
		return c.body(object.body, { status: 206, headers });
	}

	headers.set("Content-Length", `${object.size}`);
	return c.body(object.body, { headers });
});

app.all("/:bucketId/:key{.+}", (c) =>
	c.text("Method Not Allowed", 405, { Allow: "GET, HEAD, OPTIONS" })
);

export default app;
