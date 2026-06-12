import { parseRangeHeader, serveR2Object } from "../serve.worker";
import { hex } from "./common.worker";
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
const MFA_AND_LOCK_BYPASS = ["x-amz-mfa", "x-amz-bypass-governance-retention"];
/** Headers R2 recognizes but rejects on every write operation */
const WRITE_UNSUPPORTED = [
	...BUCKET_OWNER,
	"x-amz-tagging",
	"x-amz-grant-full-control",
	"x-amz-grant-read",
	"x-amz-grant-read-acp",
	"x-amz-grant-write",
	"x-amz-grant-write-acp",
	"x-amz-website-redirect-location",
	"x-amz-object-lock-mode",
	"x-amz-object-lock-retain-until-date",
	"x-amz-object-lock-legal-hold",
	"x-amz-server-side-encryption-aws-kms-key-id",
	"x-amz-server-side-encryption-context",
	"x-amz-server-side-encryption-bucket-key-enabled",
];

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
	/** Validate x-amz-server-side-encryption / x-amz-acl values */
	validatesWriteHeaders?: true;
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

/**
 * Accept canned ACLs as no-ops (R2 has no object ACLs); reject anything
 * else with the templated NotImplemented error
 */
const CANNED_ACLS = new Set([
	"private",
	"public-read",
	"public-read-write",
	"authenticated-read",
	"aws-exec-read",
	"bucket-owner-read",
	"bucket-owner-full-control",
]);

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

	if (rules.validatesWriteHeaders === true) {
		// R2 encrypts at rest with AES256 anyway, so that value is a truthful
		// no-op; KMS and other modes are not implemented
		const sse = c.req.header("x-amz-server-side-encryption");
		if (sse !== undefined && sse !== "AES256") {
			return notImplementedHeader("x-amz-server-side-encryption", sse);
		}

		const acl = c.req.header("x-amz-acl");
		if (acl !== undefined && !CANNED_ACLS.has(acl)) {
			return notImplementedHeader("x-amz-acl", acl);
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

const CONDITIONAL_HEADERS = [
	"If-Match",
	"If-None-Match",
	"If-Modified-Since",
	"If-Unmodified-Since",
];

/**
 * The request body for a write: streamed through untouched unless
 * Content-MD5 verification requires buffering it.
 */
async function verifiedRequestBody(
	c: S3Context
): Promise<ReadableStream | ArrayBuffer | string | Response> {
	if (c.req.header("Content-MD5") === undefined) {
		return c.req.raw.body ?? "";
	}

	const buffered = await c.req.raw.arrayBuffer();
	const digestError = await verifyContentMD5(c, buffered);
	return digestError ?? buffered;
}

async function verifyContentMD5(
	c: S3Context,
	body: ArrayBuffer
): Promise<Response | undefined> {
	const contentMd5 = c.req.header("Content-MD5");
	if (contentMd5 === undefined) {
		return undefined;
	}
	let provided: Uint8Array;
	try {
		provided = Uint8Array.from(atob(contentMd5), (char) => char.charCodeAt(0));
		if (provided.length !== 16) {
			throw new Error("bad length");
		}
	} catch {
		return errorResponse(
			400,
			"InvalidDigest",
			"The checksum or Content-MD5 you specified is not valid."
		);
	}
	const computed = hex(await crypto.subtle.digest("MD5", body));
	if (hex(provided) !== computed) {
		return errorResponse(
			400,
			"BadDigest",
			`The MD5 checksum you specified did not match what we received.\nYou provided a MD5 checksum with value: ${hex(provided)}\nActual MD5 was: ${computed}`
		);
	}
	return undefined;
}

/** Returns the R2 storage class for x-amz-storage-class, or an error */
function parseStorageClass(c: S3Context): string | undefined | Response {
	const header = c.req.header("x-amz-storage-class");
	switch (header) {
		case undefined:
			return undefined;
		case "STANDARD":
			return "Standard";
		case "STANDARD_IA":
			// The simulator can't persist storage classes, so rather than
			// silently storing as STANDARD, reject non-default classes
			return notImplementedHeader("x-amz-storage-class", header);
		default:
			return errorResponse(
				400,
				"InvalidStorageClass",
				"The storage class specified is not valid."
			);
	}
}

function collectCustomMetadata(c: S3Context): Record<string, string> {
	const customMetadata: Record<string, string> = {};
	for (const [name, value] of c.req.raw.headers) {
		if (name.startsWith("x-amz-meta-")) {
			customMetadata[name.slice("x-amz-meta-".length)] = value;
		}
	}

	return customMetadata;
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
	PutObject: {
		unsupportedHeaders: WRITE_UNSUPPORTED,
		validatesWriteHeaders: true,
		ssec: "write",
		async handle({ c, bucket, key }) {
			const storageClass = parseStorageClass(c);
			if (storageClass instanceof Response) {
				return storageClass;
			}

			const body = await verifiedRequestBody(c);
			if (body instanceof Response) {
				return body;
			}

			const hasConditional = CONDITIONAL_HEADERS.some(
				(name) => c.req.header(name) !== undefined
			);
			const object = await bucket.put(key, body, {
				httpMetadata: c.req.raw.headers,
				customMetadata: collectCustomMetadata(c),
				onlyIf: hasConditional ? c.req.raw.headers : undefined,
				storageClass,
			});
			if (object === null) {
				return preconditionFailed();
			}
			return c.body(null, { headers: { ETag: object.httpEtag } });
		},
	},
	DeleteObject: {
		unsupportedHeaders: [...BUCKET_OWNER, ...MFA_AND_LOCK_BYPASS],
		async handle({ c, bucket, key }) {
			await bucket.delete(key);
			return c.body(null, 204);
		},
	},
};
