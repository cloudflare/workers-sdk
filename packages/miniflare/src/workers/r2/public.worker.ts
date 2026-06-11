import { cors } from "hono/cors";
import { Hono } from "hono/tiny";
import { CorePaths } from "../core/constants";

type Env = Record<string, R2Bucket>;

function objectHeaders(object: R2Object): Headers {
	const headers = new Headers();
	object.writeHttpMetadata(headers);
	headers.set("ETag", object.httpEtag);
	headers.set("Last-Modified", object.uploaded.toUTCString());
	headers.set("Accept-Ranges", "bytes");
	return headers;
}

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

	const headers = objectHeaders(object);

	if (!("body" in object)) {
		// Some conditional header failed, but `bucket.get()` reports the
		// failure without naming the header. We need to determine which header
		// failed to determine the status code to return.
		//
		// https://datatracker.ietf.org/doc/html/rfc7232#section-6 gives the
		// order for checking headers. We know at least one header failed.
		// We must first check for a precondition header failure.
		//
		// The logic in `_testR2Conditional` ensures we can simultaneously
		// check both "If-Match" and "If-Unmodified-Since" (since a failure in
		// "If-Unmodified-Since" can be suppressed by success for a present
		// "If-Match"). These both yield status 412s upon failure.
		let preconditions: Headers | undefined;
		for (const name of ["If-Match", "If-Unmodified-Since"]) {
			const value = c.req.raw.headers.get(name);
			if (value !== null) {
				preconditions ??= new Headers();
				preconditions.set(name, value);
			}
		}
		if (preconditions !== undefined) {
			const recheck = await bucket.get(key, { onlyIf: preconditions });
			if (recheck === null) {
				return c.notFound();
			}
			if (!("body" in recheck)) {
				return c.body(null, { status: 412, headers: objectHeaders(recheck) });
			}
		}

		// Otherwise, the preconditions hold, so the failure came from a cache validator.
		return c.body(null, { status: 304, headers });
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
