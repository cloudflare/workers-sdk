import assert from "node:assert";
import { XMLValidator } from "fast-xml-parser";
import { R2S3Bindings } from "../constants";
import { parseRangeHeader, serveR2Object } from "../serve.worker";
import { awsUriEncode, credentialsEqual } from "./auth.worker";
import {
	coerceArray,
	hex,
	MAX_DELETE_KEYS,
	MAX_LIST_KEYS,
	xmlParser,
	xmlResponse,
} from "./common.worker";
import { errorResponse, noSuchBucket, notImplemented } from "./errors.worker";
import type { S3Context } from "./common.worker";
import type {
	BucketOperation,
	ObjectOperation,
	S3Operation,
} from "./detect.worker";
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
const NO_SUCH_UPLOAD: S3Error = {
	status: 404,
	code: "NoSuchUpload",
	message: "The specified multipart upload does not exist.",
};

const s3Error = (error: S3Error) =>
	errorResponse(error.status, error.code, error.message);

const noSuchKey = () => s3Error(NO_SUCH_KEY);

const preconditionFailed = () => s3Error(PRECONDITION_FAILED);

const malformedXml = () =>
	errorResponse(
		400,
		"MalformedXML",
		"The XML you provided was not well formed or did not validate against our published schema."
	);

const notImplementedHeader = (name: string, value: string) =>
	errorResponse(
		501,
		"NotImplemented",
		`Header '${name}' with value '${value}' not implemented`
	);

/**
 * R2 binding errors carry a stable v4 error code in their message (e.g.
 * "completeMultipartUpload: The specified multipart upload does not exist.
 * (10024)"); map those onto the S3 error responses real R2 returns.
 */
const BINDING_ERRORS: Partial<Record<number, S3Error>> = {
	// NO_SUCH_OBJECT_KEY
	10007: NO_SUCH_KEY,
	// ENTITY_TOO_SMALL
	10011: {
		status: 400,
		code: "EntityTooSmall",
		message:
			"Your proposed upload is smaller than the minimum allowed object size.",
	},
	// NO_SUCH_UPLOAD
	10024: NO_SUCH_UPLOAD,
	// INVALID_PART
	10025: {
		status: 400,
		code: "InvalidPart",
		message: "One or more of the specified parts could not be found.",
	},
	// PRECONDITION_FAILED
	10031: PRECONDITION_FAILED,
	// INVALID_RANGE
	10039: {
		status: 416,
		code: "InvalidRange",
		message: "The requested range is not satisfiable",
	},
};

/**
 * Parsing the message is the only option: workerd deliberately throws plain
 * Errors formatted as "<action>: <message> (<v4Code>)"; its structured
 * R2Error type is disabled (r2-rpc.c++, "all we can send back to the user
 * is a message").
 */
function bindingError(e: unknown): Response {
	const message = e instanceof Error ? e.message : String(e);
	const v4Code = /\((\d+)\)$/.exec(message);
	const known = v4Code === null ? undefined : BINDING_ERRORS[Number(v4Code[1])];
	if (known !== undefined) {
		return s3Error(known);
	}

	return errorResponse(500, "InternalError", message);
}

const BUCKET_OWNER = ["x-amz-expected-bucket-owner"];
const SOURCE_BUCKET_OWNER = ["x-amz-source-expected-bucket-owner"];
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
	operation: S3Operation,
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
		return screenSSECHeaders(c, operation, rules.ssec);
	}

	return undefined;
}

function screenSSECHeaders(
	c: S3Context,
	operation: S3Operation,
	mode: "read" | "write"
): Response | undefined {
	const prefixes =
		operation === "CopyObject" ? ["x-amz-", "x-amz-copy-source-"] : ["x-amz-"];
	for (const prefix of prefixes) {
		const algorithmName = `${prefix}server-side-encryption-customer-algorithm`;
		const algorithm = c.req.header(algorithmName);
		const key = c.req.header(`${prefix}server-side-encryption-customer-key`);
		const keyMd5 = c.req.header(
			`${prefix}server-side-encryption-customer-key-MD5`
		);
		if (algorithm === undefined && key === undefined && keyMd5 === undefined) {
			continue;
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

	return undefined;
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

/**
 * Parses `x-amz-copy-source` (`/bucket/key` or `bucket/key`) and resolves
 * the source bucket binding.
 */
function parseCopySource(
	c: S3Context,
	bucketId: string
): { bucket: R2Bucket; key: string } | Response {
	// detectObjectOperation() only routes to copy operations when the header
	// exists
	const header = c.req.header("x-amz-copy-source");
	assert(header !== undefined);
	const raw = decodeURIComponent(header);
	const source = raw.startsWith("/") ? raw.slice(1) : raw;
	const separator = source.indexOf("/");
	if (separator === -1 || separator === source.length - 1) {
		return errorResponse(400, "InvalidArgument", "copy source bucket name");
	}

	const sourceBucketId = source.slice(0, separator);
	const bucket = c.env[`${R2S3Bindings.BUCKET_PREFIX}${sourceBucketId}`];
	if (bucket === undefined) {
		return noSuchBucket();
	}

	// Credentials are per-bucket: the pair the request authenticated with
	// (the target bucket's) must also grant access to the source bucket.
	// Real R2 credentials are account-scoped, so it has no equivalent check.
	const credentials = c.env[R2S3Bindings.JSON_CREDENTIALS];
	const sourceCredentials = credentials[sourceBucketId];
	const targetCredentials = credentials[bucketId];
	assert(sourceCredentials !== undefined && targetCredentials !== undefined);
	if (!credentialsEqual(sourceCredentials, targetCredentials)) {
		return errorResponse(401, "Unauthorized", "Unauthorized");
	}

	return { bucket, key: source.slice(separator + 1) };
}

/** Maps x-amz-copy-source-if-* headers onto standard conditional headers */
function copySourceConditionals(c: S3Context): Headers | undefined {
	let headers: Headers | undefined;
	for (const standard of CONDITIONAL_HEADERS) {
		const value = c.req.header(`x-amz-copy-source-${standard.toLowerCase()}`);
		if (value !== undefined) {
			headers ??= new Headers();
			headers.set(standard, value);
		}
	}

	return headers;
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

async function listObjects(
	params: URLSearchParams,
	bucket: R2Bucket,
	bucketId: string,
	v2: boolean
): Promise<Response> {
	const encodingType = params.get("encoding-type");
	if (encodingType !== null && encodingType !== "url") {
		return notImplemented(
			`Unrecognized encoding-type "${encodingType}" not implemented`
		);
	}

	const encode = (value: string) =>
		encodingType === "url" ? awsUriEncode(value) : value;

	// R2 floors fractional values and allows 0 and values above the limit
	// (clamping the effective page size but echoing the requested MaxKeys)
	let maxKeys = MAX_LIST_KEYS;
	const maxKeysParam = params.get("max-keys");
	if (maxKeysParam !== null) {
		// `Number("")` is 0, but R2 rejects an empty max-keys
		const value =
			maxKeysParam.trim() === "" ? Number.NaN : Number(maxKeysParam);
		if (!Number.isFinite(value) || value < 0) {
			return errorResponse(
				400,
				"InvalidMaxKeys",
				"MaxKeys params must be positive integer <= 1000."
			);
		}

		maxKeys = Math.floor(value);
	}
	const limit = Math.min(maxKeys, MAX_LIST_KEYS);

	const prefix = params.get("prefix") ?? "";
	const delimiter = params.get("delimiter") ?? undefined;
	const marker = v2 ? undefined : (params.get("marker") ?? undefined);
	const startAfter = v2 ? (params.get("start-after") ?? undefined) : marker;
	const continuationToken = v2
		? (params.get("continuation-token") ?? undefined)
		: undefined;

	let objects: R2Object[] = [];
	let delimitedPrefixes: string[] = [];
	let truncated = false;
	let cursor: string | undefined;
	let result;
	try {
		result = await bucket.list({
			prefix,
			delimiter,
			// For max-keys=0, list one key anyway: R2 reports IsTruncated based
			// on whether any matching keys exist
			limit: Math.max(limit, 1),
			startAfter,
			cursor: continuationToken,
		});
	} catch (e) {
		return bindingError(e);
	}

	if (limit === 0) {
		truncated =
			result.objects.length > 0 || result.delimitedPrefixes.length > 0;
	} else {
		objects = result.objects;
		delimitedPrefixes = result.delimitedPrefixes;
		truncated = result.truncated;
		cursor = result.truncated ? result.cursor : undefined;
	}

	const contents = objects.map((object) => ({
		Key: encode(object.key),
		Size: object.size,
		LastModified: object.uploaded.toISOString(),
		ETag: object.httpEtag,
		// The local simulator does not store storage classes
		StorageClass: "STANDARD",
	}));
	const commonPrefixes = delimitedPrefixes.map((value) => ({
		Prefix: encode(value),
	}));
	// NextMarker is the lexicographically last returned item, which can be a
	// CommonPrefix (prefixes sort after the keys they group)
	const lastObjectKey = objects[objects.length - 1]?.key;
	const lastPrefix = delimitedPrefixes[delimitedPrefixes.length - 1];
	const lastKey =
		lastPrefix !== undefined &&
		(lastObjectKey === undefined || lastPrefix > lastObjectKey)
			? lastPrefix
			: lastObjectKey;

	return xmlResponse("ListBucketResult", {
		Name: bucketId,
		...(contents.length > 0 ? { Contents: contents } : {}),
		IsTruncated: truncated,
		...(commonPrefixes.length > 0 ? { CommonPrefixes: commonPrefixes } : {}),
		Prefix: encode(prefix),
		...(delimiter !== undefined ? { Delimiter: encode(delimiter) } : {}),
		...(v2
			? {
					...(startAfter !== undefined
						? { StartAfter: encode(startAfter) }
						: {}),
					...(continuationToken !== undefined
						? { ContinuationToken: continuationToken }
						: {}),
					...(cursor !== undefined ? { NextContinuationToken: cursor } : {}),
				}
			: {
					Marker: encode(marker ?? ""),
					...(truncated && lastKey !== undefined
						? { NextMarker: encode(lastKey) }
						: {}),
				}),
		MaxKeys: maxKeys,
		...(v2 ? { KeyCount: contents.length + commonPrefixes.length } : {}),
		...(encodingType !== null ? { EncodingType: encodingType } : {}),
	});
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
	CopyObject: {
		unsupportedHeaders: [
			...WRITE_UNSUPPORTED,
			...SOURCE_BUCKET_OWNER,
			"x-amz-tagging-directive",
			"x-amz-checksum-algorithm",
		],
		validatesWriteHeaders: true,
		ssec: "write",
		async handle({ c, bucket, bucketId, key }) {
			const directive = c.req.header("x-amz-metadata-directive") ?? "COPY";
			if (directive !== "COPY" && directive !== "REPLACE") {
				return errorResponse(
					400,
					"InvalidArgument",
					`metadata directive ${directive}.`
				);
			}
			const storageClass = parseStorageClass(c);
			if (storageClass instanceof Response) {
				return storageClass;
			}
			const source = parseCopySource(c, bucketId);
			if (source instanceof Response) {
				return source;
			}

			const sourceObject = await source.bucket.get(source.key, {
				onlyIf: copySourceConditionals(c),
			});
			if (sourceObject === null) {
				return noSuchKey();
			}
			if (!("body" in sourceObject)) {
				return preconditionFailed();
			}

			const object = await bucket.put(key, sourceObject.body, {
				httpMetadata:
					directive === "COPY" ? sourceObject.httpMetadata : c.req.raw.headers,
				customMetadata:
					directive === "COPY"
						? sourceObject.customMetadata
						: collectCustomMetadata(c),
				storageClass,
			});
			if (object === null) {
				return preconditionFailed();
			}
			return xmlResponse("CopyObjectResult", {
				ETag: object.httpEtag,
				LastModified: object.uploaded.toISOString(),
			});
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

export const BUCKET_OPERATIONS: Record<
	BucketOperation,
	OperationDefinition<BucketOperationContext> & ScreeningRules
> = {
	HeadBucket: {
		unsupportedHeaders: BUCKET_OWNER,
		// The bucket exists, or routing would have 404ed already
		handle: ({ c }) => c.body(null, 200),
	},
	GetBucketLocation: {
		unsupportedHeaders: BUCKET_OWNER,
		// Real R2 reports the bucket's location hint (e.g. ENAM); local
		// buckets have no location
		handle: () => xmlResponse("LocationConstraint", { "#text": "auto" }),
	},
	// R2 always encrypts at rest with AES256; there is no per-bucket config
	GetBucketEncryption: {
		unsupportedHeaders: BUCKET_OWNER,
		handle: () =>
			xmlResponse("ServerSideEncryptionConfiguration", {
				Rule: {
					ApplyServerSideEncryptionByDefault: { SSEAlgorithm: "AES256" },
					BucketKeyEnabled: true,
				},
			}),
	},
	// R2 has no bucket versioning, tagging, object lock, or replication;
	// these responses are identical for every bucket
	GetBucketVersioning: {
		unsupportedHeaders: BUCKET_OWNER,
		handle: () => xmlResponse("VersioningConfiguration", {}),
	},
	GetBucketTagging: {
		unsupportedHeaders: BUCKET_OWNER,
		handle: () =>
			errorResponse(404, "NoSuchTagSet", "The TagSet does not exist."),
	},
	GetObjectLockConfiguration: {
		unsupportedHeaders: BUCKET_OWNER,
		handle: () =>
			errorResponse(
				404,
				"ObjectLockConfigurationNotFoundError",
				"Object Lock configuration does not exist for this bucket."
			),
	},
	GetBucketReplication: {
		unsupportedHeaders: BUCKET_OWNER,
		handle: () =>
			errorResponse(
				404,
				"ReplicationConfigurationNotFoundError",
				"The replication configuration was not found."
			),
	},
	ListObjects: {
		unsupportedHeaders: BUCKET_OWNER,
		handle: ({ params, bucket, bucketId }) =>
			listObjects(params, bucket, bucketId, false),
	},
	ListObjectsV2: {
		unsupportedHeaders: BUCKET_OWNER,
		handle: ({ params, bucket, bucketId }) =>
			listObjects(params, bucket, bucketId, true),
	},
	DeleteObjects: {
		unsupportedHeaders: [...BUCKET_OWNER, ...MFA_AND_LOCK_BYPASS],
		async handle({ c, bucket }) {
			const body = await c.req.raw.arrayBuffer();
			const digestError = await verifyContentMD5(c, body);
			if (digestError !== undefined) {
				return digestError;
			}

			const text = new TextDecoder().decode(body);
			if (XMLValidator.validate(text) !== true) {
				return malformedXml();
			}

			const parsed: unknown = xmlParser.parse(text);
			const request = (
				parsed as { Delete?: { Object?: unknown; Quiet?: unknown } }
			).Delete;
			if (request === undefined) {
				return malformedXml();
			}

			const keys: string[] = [];
			for (const object of coerceArray(request.Object)) {
				const key = (object as { Key?: unknown }).Key;
				if (typeof key !== "string") {
					return malformedXml();
				}

				keys.push(key);
			}

			if (keys.length === 0 || keys.length > MAX_DELETE_KEYS) {
				return malformedXml();
			}

			// R2 validates Quiet strictly but then ignores it.
			// The Deleted list is returned even in quiet mode.
			if (
				request.Quiet !== undefined &&
				request.Quiet !== "true" &&
				request.Quiet !== "false"
			) {
				return malformedXml();
			}

			await bucket.delete(keys);

			// Deletes are idempotent: missing keys are still reported as Deleted
			return xmlResponse("DeleteResult", {
				Deleted: keys.map((key) => ({ Key: key })),
			});
		},
	},
};
