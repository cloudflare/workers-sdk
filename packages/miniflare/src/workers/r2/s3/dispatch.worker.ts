// The per-bucket request pipeline: resolve the bucket and its credentials,
// authenticate, then run the requested operation.
import assert from "node:assert";
import { R2S3Bindings } from "../constants";
import { verifyRequest } from "./auth.worker";
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
		// Real R2 verifies the signature before bucket existence (auth errors
		// win over the 404), but its credentials are account-scoped while
		// local credentials are per-bucket: an unknown bucket has no
		// credential set to verify against, so existence is reported first.
		return noSuchBucket();
	}

	const authError = verifyRequest(c.req.raw, credentials);
	if (authError !== undefined) {
		return stripBodyForHead(c, authError);
	}

	return notImplemented("S3 operations are not yet implemented");
}
