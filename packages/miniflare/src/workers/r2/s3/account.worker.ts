// The S3 API's one account-level operation: ListBuckets. There is no bucket
// in the path to resolve credentials from, so authentication works
// differently from the per-bucket operations in `dispatch.worker.ts`.
import assert from "node:assert";
import { R2S3Bindings } from "../constants";
import { credentialsEqual, verifyRequest } from "./auth.worker";
import { stripBodyForHead, xmlResponse } from "./common.worker";
import { isScreenedParam } from "./detect.worker";
import { notImplemented, routeNotFound } from "./errors.worker";
import type { S3Credentials } from "../constants";
import type { S3Context } from "./common.worker";

/**
 * Verifies the request against every configured credential set, returning
 * the matching credentials, or the auth error if none verify. The request
 * can only have been signed with one set, so the first success is the match.
 */
async function verifyAgainstSome(
	c: S3Context
): Promise<{ matched: S3Credentials } | { error: Response }> {
	let error: Response | undefined;
	const seenPairs = new Set<string>();
	for (const credentials of Object.values(
		c.env[R2S3Bindings.JSON_CREDENTIALS]
	)) {
		// Buckets often share a credential pair; verify each pair once
		const pair = `${credentials.accessKeyId}\0${credentials.secretAccessKey}`;
		if (seenPairs.has(pair)) {
			continue;
		}
		seenPairs.add(pair);

		const result = await verifyRequest(c.req.raw, credentials);
		if (result === undefined) {
			return { matched: credentials };
		}

		// A 401 just means this set's access key id didn't match; an error
		// from a set whose key id did match (e.g. SignatureDoesNotMatch) is
		// the precise one
		if (error === undefined || error.status === 401) {
			error = result;
		}
	}

	// The service only exists when at least one credential set is configured
	assert(error !== undefined);
	return { error };
}

/**
 * ListBuckets is account-level: there is no bucket to resolve credentials
 * from, so try each configured credential set; the request can only have
 * been signed with one of them. Lists the buckets the matching credentials
 * grant access to (locally, all buckets sharing that credential pair).
 */
export async function listBuckets(c: S3Context): Promise<Response> {
	return stripBodyForHead(c, await listBucketsInner(c));
}

async function listBucketsInner(c: S3Context): Promise<Response> {
	if (c.req.method !== "GET") {
		return routeNotFound();
	}

	const credentialsById = c.env[R2S3Bindings.JSON_CREDENTIALS];
	const verified = await verifyAgainstSome(c);
	if ("error" in verified) {
		return verified.error;
	}
	const matched = verified.matched;

	for (const name of new URL(c.req.url).searchParams.keys()) {
		if (!isScreenedParam(name)) {
			return notImplemented(
				`ListBuckets search parameter ${name} not implemented`
			);
		}
	}

	const buckets = Object.entries(credentialsById)
		.filter(([, credentials]) => credentialsEqual(credentials, matched))
		.map(([id]) => ({ Name: id }));
	return xmlResponse("ListAllMyBucketsResult", {
		Buckets: buckets.length > 0 ? { Bucket: buckets } : {},
	});
}
