import { parseRangeHeader, serveR2Object } from "../serve.worker";
import { errorResponse } from "./errors.worker";
import type { S3Context } from "./common.worker";
import type { ObjectOperation } from "./detect.worker";
import type { Awaitable } from "miniflare:shared";

interface S3Error {
	status: number;
	code: string;
	message: string;
}

const NO_SUCH_KEY: S3Error = {
	status: 404,
	code: "NoSuchKey",
	message: "The specified key does not exist.",
};
const PRECONDITION_FAILED: S3Error = {
	status: 412,
	code: "PreconditionFailed",
	message: "At least one of the pre-conditions you specified did not hold.",
};
const s3Error = (error: S3Error) =>
	errorResponse(error.status, error.code, error.message);

const noSuchKey = () => s3Error(NO_SUCH_KEY);

const preconditionFailed = () => s3Error(PRECONDITION_FAILED);

const notImplementedHeader = (name: string, value: string) =>
	errorResponse(
		501,
		"NotImplemented",
		`Header '${name}' with value '${value}' not implemented`
	);

const BUCKET_OWNER = ["x-amz-expected-bucket-owner"];

/** Everything a bucket-level handler might need, resolved once in `dispatch()` */
export interface BucketOperationContext {
	c: S3Context;
	bucket: R2Bucket;
	bucketId: string;
	params: URLSearchParams;
}

/** Object-level operations additionally address a key within the bucket */
export interface ObjectOperationContext extends BucketOperationContext {
	key: string;
}

export interface ScreeningRules {
	/** Headers rejected with the templated NotImplemented error */
	unsupportedHeaders: string[];
	/**
	 * SSE-C handling: real R2 supports SSE-C on these operations, but the
	 * local simulator ignores encryption keys. "read" returns R2's standard
	 * error for SSE-C parameters on an unencrypted object; "write" reports
	 * the header as NotImplemented rather than silently storing plaintext.
	 */
	ssec?: "read" | "write";
}

export interface OperationDefinition<Context> {
	handle(operation: Context): Awaitable<Response>;
}

export function screenHeaders(
	c: S3Context,
	rules: ScreeningRules
): Response | undefined {
	// Reject session tokens on every operation (auth-level, not
	// operation-level)
	if (c.req.header("x-amz-security-token") !== undefined) {
		return errorResponse(400, "InvalidArgument", "X-Amz-Security-Token");
	}

	for (const name of rules.unsupportedHeaders) {
		const value = c.req.header(name);
		if (value !== undefined) {
			return notImplementedHeader(name, value);
		}
	}

	if (rules.ssec !== undefined) {
		return screenSSECHeaders(c, rules.ssec);
	}

	return undefined;
}

function screenSSECHeaders(
	c: S3Context,
	mode: "read" | "write"
): Response | undefined {
	const algorithmName = "x-amz-server-side-encryption-customer-algorithm";
	const algorithm = c.req.header(algorithmName);
	const key = c.req.header("x-amz-server-side-encryption-customer-key");
	const keyMd5 = c.req.header("x-amz-server-side-encryption-customer-key-MD5");
	if (algorithm === undefined && key === undefined && keyMd5 === undefined) {
		return undefined;
	}

	// R2 requires the full header triple, checked in this order
	if (key === undefined) {
		return errorResponse(
			400,
			"InvalidArgument",
			"Requests specifying Server Side Encryption with Customer provided keys must provide an appropriate secret key."
		);
	}
	if (keyMd5 === undefined) {
		return errorResponse(
			400,
			"InvalidArgument",
			"Requests specifying Server Side Encryption with Customer provided keys must provide the client calculated MD5 of the secret key."
		);
	}
	if (algorithm === undefined) {
		return errorResponse(
			400,
			"InvalidArgument",
			"Requests specifying Server Side Encryption with Customer provided keys must provide a valid encryption algorithm."
		);
	}
	// After the triple is complete, R2 validates the algorithm value (on
	// reads, writes, and copy sources alike) before anything else
	if (algorithm !== "AES256") {
		return errorResponse(
			400,
			"InvalidEncryptionAlgorithmError",
			"The encryption request that you specified is not valid. The valid value is AES256."
		);
	}

	return mode === "read"
		? errorResponse(
				400,
				"InvalidRequest",
				"The encryption parameters are not applicable to this object."
			)
		: notImplementedHeader(algorithmName, algorithm);
}

function serveObject(
	c: S3Context,
	bucket: R2Bucket,
	key: string
): Awaitable<Response> {
	const rangeHeader = c.req.header("Range");
	const range = rangeHeader === undefined ? {} : parseRangeHeader(rangeHeader);
	if ("error" in range) {
		switch (range.error) {
			case "malformed":
				// R2's message really ends with `.'`
				return errorResponse(
					400,
					"InvalidArgument",
					"range must be in format 'bytes=start-end', 'bytes=start-' or 'bytes=-suffix'.'"
				);
			case "inverted":
				return errorResponse(400, "InvalidArgument", "range must be positive.");
			case "unsatisfiable":
				return errorResponse(
					416,
					"InvalidRange",
					"The requested range is not satisfiable"
				);
		}
	}

	return serveR2Object(
		c.req.raw,
		bucket,
		key,
		{
			notFound: noSuchKey,
			preconditionFailed,
			invalidRange: () =>
				errorResponse(
					416,
					"InvalidRange",
					"The requested range is not satisfiable"
				),
			decorateHeaders(object, headers) {
				for (const [name, value] of Object.entries(
					object.customMetadata ?? {}
				)) {
					headers.set(`x-amz-meta-${name}`, value);
				}
			},
		},
		range
	);
}

export const OBJECT_OPERATIONS: Record<
	ObjectOperation,
	OperationDefinition<ObjectOperationContext> & ScreeningRules
> = {
	GetObject: {
		unsupportedHeaders: BUCKET_OWNER,
		ssec: "read",
		handle: ({ c, bucket, key }) => serveObject(c, bucket, key),
	},
	HeadObject: {
		unsupportedHeaders: BUCKET_OWNER,
		ssec: "read",
		handle: ({ c, bucket, key }) => serveObject(c, bucket, key),
	},
};
