// The per-bucket request pipeline: resolve the bucket and its credentials,
// then run the requested operation.
import assert from "node:assert";
import { R2S3Bindings } from "../constants";
import { stripBodyForHead } from "./common.worker";
import { noSuchBucket, notImplemented } from "./errors.worker";
import type { S3Context } from "./common.worker";

export function dispatch(c: S3Context): Response {
	return stripBodyForHead(c, dispatchInner(c));
}

function dispatchInner(c: S3Context): Response {
	// Both routes that reach `dispatch()` carry a :bucketId segment
	const bucketId = c.req.param("bucketId");
	assert(bucketId !== undefined);

	const credentials = c.env[R2S3Bindings.JSON_CREDENTIALS][bucketId];
	if (credentials === undefined) {
		return noSuchBucket();
	}

	return notImplemented("S3 operations are not yet implemented");
}
