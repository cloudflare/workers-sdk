// S3-compatible API for local R2 buckets. Status codes, headers, XML bodies,
// and header-screening behavior mimic R2's S3 endpoint, captured from a real
// bucket (2026-06-11).

import { cors } from "hono/cors";
import { Hono } from "hono/tiny";
import { CorePaths } from "../../core/constants";
import { stripBodyForHead } from "./common.worker";
import { dispatch } from "./dispatch.worker";
import { routeNotFound } from "./errors.worker";
import type { Env } from "./common.worker";

const app = new Hono<{ Bindings: Env }>().basePath(CorePaths.R2_S3);

app.use(
	cors({
		origin: "*",
		allowMethods: ["GET", "HEAD", "PUT", "POST", "DELETE"],
		exposeHeaders: ["*"],
	})
);

app.all("/:bucketId/:key{.+}", (c) => dispatch(c));
app.all("/:bucketId", (c) => dispatch(c));
app.all("/", (c) => stripBodyForHead(c, routeNotFound()));

export default app;
