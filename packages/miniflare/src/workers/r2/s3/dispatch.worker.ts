// The per-bucket request pipeline: resolve the bucket and its credentials,
// authenticate, detect the operation, screen its headers, then run it.
import assert from "node:assert";
import { R2S3Bindings } from "../constants";
import { hasAuthentication, verifyRequest } from "./auth.worker";
import { stripBodyForHead } from "./common.worker";
import { detectBucketOperation, detectObjectOperation } from "./detect.worker";
import { noSuchBucket, notImplemented } from "./errors.worker";
import {
	BUCKET_OPERATIONS,
	OBJECT_OPERATIONS,
	screenHeaders,
} from "./operations.worker";
import type { S3Context } from "./common.worker";
import type { S3Operation } from "./detect.worker";
import type { OperationDefinition, ScreeningRules } from "./operations.worker";
import type { Awaitable } from "miniflare:shared";

export async function dispatch(
	c: S3Context,
	key: string | undefined
): Promise<Response> {
	return stripBodyForHead(c, await dispatchInner(c, key));
}

async function dispatchInner(
	c: S3Context,
	key: string | undefined
): Promise<Response> {
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

	// The plugin binds exactly the buckets in the credential map
	const bucket = c.env[`${R2S3Bindings.BUCKET_PREFIX}${bucketId}`];
	assert(bucket !== undefined);

	const params = new URL(c.req.url).searchParams;

	// R2 interprets a bucket-level POST carrying no auth at all as an
	// attempted browser form upload (AWS's POST Object, where auth travels in
	// the form fields), which it recognizes but does not implement. The
	// doubled "not implemented" is R2's, verbatim. `?delete` (DeleteObjects)
	// gets the normal missing-auth error instead.
	if (
		key === undefined &&
		c.req.method === "POST" &&
		!params.has("delete") &&
		!hasAuthentication(c.req.raw, params)
	) {
		return notImplemented(
			"Presigned post requests are not yet implemented not implemented"
		);
	}

	const authError = await verifyRequest(c.req.raw, credentials);
	if (authError !== undefined) {
		return authError;
	}

	const detected = detectOperation(c, bucket, bucketId, key, params);
	if (detected instanceof Response) {
		return detected;
	}

	const screenError = screenHeaders(c, detected.operation, detected.rules);
	if (screenError !== undefined) {
		return screenError;
	}

	return detected.run();
}

/** A detected operation, bound to the context its handler needs */
interface BoundOperation {
	operation: S3Operation;
	rules: ScreeningRules;
	run(): Awaitable<Response>;
}

/**
 * Detection and the operation tables are split by addressing level
 * (bucket- and object-level operations take different contexts). Binding
 * the context here keeps those splits out of `dispatch()`.
 */
function detectOperation(
	c: S3Context,
	bucket: R2Bucket,
	bucketId: string,
	key: string | undefined,
	params: URLSearchParams
): BoundOperation | Response {
	if (key === undefined) {
		const detected = detectBucketOperation(c.req.method, params);
		if (detected instanceof Response) {
			return detected;
		}

		return bind(detected, BUCKET_OPERATIONS, { c, bucket, bucketId, params });
	}

	const detected = detectObjectOperation(c, params);
	if (detected instanceof Response) {
		return detected;
	}

	return bind(detected, OBJECT_OPERATIONS, {
		c,
		bucket,
		bucketId,
		key,
		params,
	});
}

function bind<Operation extends S3Operation, Context>(
	operation: Operation,
	table: Record<Operation, OperationDefinition<Context> & ScreeningRules>,
	context: Context
): BoundOperation {
	const definition = table[operation];
	return {
		operation,
		rules: definition,
		run: () => definition.handle(context),
	};
}
