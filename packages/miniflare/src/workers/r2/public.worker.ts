import { cors } from "hono/cors";
import { Hono } from "hono/tiny";
import { CorePaths } from "../core/constants";
import { parseRangeHeader, serveR2Object } from "./serve.worker";

type Env = Record<string, R2Bucket>;

const app = new Hono<{ Bindings: Env }>().basePath(CorePaths.R2_PUBLIC);

app.use(
	cors({ origin: "*", allowMethods: ["GET", "HEAD"], exposeHeaders: ["*"] })
);

app.on(["GET", "HEAD"], "/:bucketId/:key{.+}", async (c) => {
	const bucketId = c.req.param("bucketId");
	const key = c.req.param("key");

	const bucket = c.env[bucketId];
	if (bucket === undefined) {
		return c.notFound();
	}

	// Reject malformed, multiple, and inverted ranges with 400 rather than
	// ignoring them, and zero-length suffix ranges (`bytes=-0`) with 416
	const rangeHeader = c.req.header("Range");
	const parsedRange =
		rangeHeader === undefined ? undefined : parseRangeHeader(rangeHeader);
	if (parsedRange !== undefined && "error" in parsedRange) {
		return c.body(null, parsedRange.error === "unsatisfiable" ? 416 : 400);
	}

	return serveR2Object(
		c.req.raw,
		bucket,
		key,
		{
			notFound: () => c.notFound(),
			preconditionFailed: () => c.body(null, 412),
			invalidRange: () => c.body(null, 416),
		},
		parsedRange
	);
});

app.all("/:bucketId/:key{.+}", (c) => c.body(null, 401));

export default app;
