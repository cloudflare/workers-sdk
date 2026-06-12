import { errorResponse, notImplemented, routeNotFound } from "./errors.worker";
import type { S3Context } from "./common.worker";

const notImplementedOperation = (name: string) =>
	notImplemented(`${name} not implemented`);

export type BucketOperation =
	| "HeadBucket"
	| "GetBucketLocation"
	| "GetBucketEncryption"
	| "GetBucketVersioning"
	| "GetBucketTagging"
	| "GetObjectLockConfiguration"
	| "GetBucketReplication"
	| "ListObjects"
	| "ListObjectsV2"
	| "DeleteObjects";

export type ObjectOperation =
	| "GetObject"
	| "HeadObject"
	| "PutObject"
	| "CopyObject"
	| "DeleteObject";

export type S3Operation = BucketOperation | ObjectOperation;

/**
 * Object-level subresource query parameters map onto operations R2's S3
 * endpoint recognizes but does not implement. Subresource parameters
 * without an entry for the request method are silently ignored (e.g.
 * `DELETE ?tagging` is plain DeleteObject on R2).
 */
const OBJECT_SUBRESOURCES: Record<string, Partial<Record<string, string>>> = {
	tagging: { GET: "GetObjectTagging", PUT: "PutObjectTagging" },
	acl: { GET: "GetObjectAcl", PUT: "PutObjectAcl" },
	attributes: { GET: "GetObjectAttributes" },
	torrent: { GET: "GetObjectTorrent" },
	retention: { GET: "GetObjectRetention", PUT: "PutObjectRetention" },
	"legal-hold": { GET: "GetObjectLegalHold", PUT: "PutObjectLegalHold" },
};

/**
 * Bucket-level GET subresources that respond with R2's templated
 * "<name> not implemented" error. Most are unimplemented on R2 too.
 * acl/cors/lifecycle are implemented by real R2 but return per-bucket state
 * (CORS rules, lifecycle rules, the account id in the ACL owner)
 * that the R2 binding does not expose.
 */
const BUCKET_GET_NOT_IMPLEMENTED: Partial<Record<string, string>> = {
	versions: "ListObjectVersions",
	policy: "GetBucketPolicy",
	website: "GetBucketWebsite",
	notification: "GetBucketNotificationConfiguration",
	requestPayment: "GetBucketRequestPayment",
	logging: "GetBucketLogging",
	accelerate: "GetBucketAccelerateConfiguration",
	publicAccessBlock: "GetPublicAccessBlock",
	ownershipControls: "GetBucketOwnershipControls",
	"intelligent-tiering": "GetBucketIntelligentTieringConfiguration",
	inventory: "GetBucketInventoryConfiguration",
	metrics: "GetBucketMetricsConfiguration",
	analytics: "GetBucketAnalyticsConfiguration",
	// R2's typo, reproduced verbatim
	policyStatus: "GetGetBucketPolicyStatus",
	acl: "GetBucketAcl",
	cors: "GetBucketCors",
	lifecycle: "GetBucketLifecycleConfiguration",
};

/**
 * Bucket-level PUT subresources, all answered with R2's templated named
 * error. cors/encryption/lifecycle/versioning are implemented by real R2
 * (it validates the XML body before anything else) but write per-bucket
 * state the R2 binding cannot manage; since prod never reveals its names
 * for them, they use the AWS operation names.
 */
const BUCKET_PUT_NOT_IMPLEMENTED: Partial<Record<string, string>> = {
	accelerate: "PutBucketAccelerateConfiguration",
	acl: "PutBucketAcl",
	analytics: "PutBucketAnalyticsConfiguration",
	"intelligent-tiering": "PutBucketIntelligentTieringConfiguration",
	inventory: "PutBucketInventoryConfiguration",
	logging: "PutBucketLogging",
	metrics: "PutBucketMetricsConfiguration",
	notification: "PutBucketNotificationConfiguration",
	"object-lock": "PutObjectLockConfiguration",
	ownershipControls: "PutBucketOwnershipControls",
	policy: "PutBucketPolicy",
	publicAccessBlock: "PutPublicAccessBlock",
	replication: "PutBucketReplication",
	requestPayment: "PutBucketRequestPayment",
	tagging: "PutBucketTagging",
	website: "PutBucketWebsite",
	cors: "PutBucketCors",
	encryption: "PutBucketEncryption",
	lifecycle: "PutBucketLifecycleConfiguration",
	versioning: "PutBucketVersioning",
};

/**
 * Bucket-level DELETE subresources. cors/encryption/lifecycle are
 * implemented by real R2 (permission-gated) but have no binding equivalent;
 * AWS operation names, as above. Subresources that exist only for other
 * methods (?versioning, ?acl, ...) are NOT special-cased on DELETE; R2
 * reports them via the "Unsupported search param(s)" error.
 */
const BUCKET_DELETE_NOT_IMPLEMENTED: Partial<Record<string, string>> = {
	analytics: "DeleteBucketAnalyticsConfiguration",
	"intelligent-tiering": "DeleteBucketIntelligentTieringConfiguration",
	inventory: "DeleteBucketInventoryConfiguration",
	metrics: "DeleteBucketMetricsConfiguration",
	ownershipControls: "DeleteBucketOwnershipControls",
	policy: "DeleteBucketPolicy",
	replication: "DeleteBucketReplication",
	tagging: "DeleteBucketTagging",
	website: "DeleteBucketWebsite",
	cors: "DeleteBucketCors",
	encryption: "DeleteBucketEncryption",
	lifecycle: "DeleteBucketLifecycle",
};

/**
 * Bucket-configuration reads with static responses on R2 (identical
 * for every bucket, since R2 has no versioning/tagging/object
 * lock/replication and always encrypts with AES256)
 */
const BUCKET_GET_STATIC: Partial<Record<string, BucketOperation>> = {
	encryption: "GetBucketEncryption",
	versioning: "GetBucketVersioning",
	tagging: "GetBucketTagging",
	"object-lock": "GetObjectLockConfiguration",
	replication: "GetBucketReplication",
};

/**
 * Query parameters R2 accepts on list requests. Reject anything else
 * (excluding presign parameters and the SDK's x-id) with R2's
 * "search parameter" error.
 */
const LIST_OBJECTS_PARAMS = new Set([
	"prefix",
	"delimiter",
	"marker",
	"max-keys",
	"encoding-type",
]);
const LIST_OBJECTS_V2_PARAMS = new Set([
	"list-type",
	"prefix",
	"delimiter",
	"continuation-token",
	"start-after",
	"max-keys",
	"encoding-type",
	"fetch-owner",
]);

export function isScreenedParam(name: string): boolean {
	return name.startsWith("X-Amz-") || name === "x-id";
}

function detectListOperation(
	params: URLSearchParams
): BucketOperation | Response {
	const listType = params.get("list-type");
	if (listType !== null && listType !== "2") {
		return notImplementedOperation(`ListObjectsV${listType}`);
	}

	const v2 = listType === "2";
	// Reject V2-only pagination on V1
	if (!v2 && params.has("continuation-token")) {
		return errorResponse(
			400,
			"InvalidArgument",
			"continuation-token not supported in ListObjects"
		);
	}

	const allowed = v2 ? LIST_OBJECTS_V2_PARAMS : LIST_OBJECTS_PARAMS;
	for (const name of params.keys()) {
		if (!allowed.has(name) && !isScreenedParam(name)) {
			return notImplemented(
				`ListObjectsV${v2 ? "2" : "1"} search parameter ${name} not implemented`
			);
		}
	}

	return v2 ? "ListObjectsV2" : "ListObjects";
}

/**
 * Bucket-level PUT/DELETE: a recognized subresource (in any position) wins
 * with its named templated error; otherwise every non-presign param is
 * rejected together. Only a bare PUT/DELETE reaches CreateBucket /
 * DeleteBucket; both are implemented by real R2, but local buckets are
 * statically configured, so they get the templated named error instead.
 */
function detectBucketMutation(
	method: string,
	params: URLSearchParams,
	subresources: Partial<Record<string, string>>,
	bareOperation: string
): Response {
	for (const name of params.keys()) {
		const operation = subresources[name];
		if (operation !== undefined) {
			return notImplementedOperation(operation);
		}
	}

	const unsupported = [...new Set(params.keys())].filter(
		(name) => !isScreenedParam(name)
	);
	if (unsupported.length > 0) {
		return errorResponse(
			400,
			"InvalidArgument",
			`Unsupported search param(s) ${unsupported
				.map((name) => `"${name}"`)
				.join(", ")} on a ${method} bucket route`
		);
	}

	return notImplementedOperation(bareOperation);
}

export function detectBucketOperation(
	method: string,
	params: URLSearchParams
): BucketOperation | Response {
	switch (method) {
		case "HEAD":
			return "HeadBucket";
		case "PUT":
			return detectBucketMutation(
				"PUT",
				params,
				BUCKET_PUT_NOT_IMPLEMENTED,
				"CreateBucket"
			);
		case "DELETE":
			return detectBucketMutation(
				"DELETE",
				params,
				BUCKET_DELETE_NOT_IMPLEMENTED,
				"DeleteBucket"
			);
		case "POST":
			// ?delete is DeleteObjects; respond 200 with an empty body to
			// any other bucket-level POST
			return params.has("delete")
				? "DeleteObjects"
				: new Response(null, { status: 200 });
		case "GET": {
			if (params.has("uploads")) {
				return notImplementedOperation("ListMultipartUploads");
			}

			if (params.has("location")) {
				for (const name of params.keys()) {
					if (name !== "location" && !isScreenedParam(name)) {
						return errorResponse(
							400,
							"InvalidArgument",
							`Search param ${name} is unsupported for bucket location`
						);
					}
				}

				return "GetBucketLocation";
			}

			for (const name of params.keys()) {
				const staticOperation = BUCKET_GET_STATIC[name];
				if (staticOperation !== undefined) {
					return staticOperation;
				}

				const notImplementedName = BUCKET_GET_NOT_IMPLEMENTED[name];
				if (notImplementedName !== undefined) {
					return notImplementedOperation(notImplementedName);
				}
			}

			return detectListOperation(params);
		}
		default:
			return routeNotFound();
	}
}

/** A recognized object subresource wins with its named templated error */
function objectSubresourceError(
	params: URLSearchParams,
	method: string
): Response | undefined {
	for (const name of params.keys()) {
		const subresource = OBJECT_SUBRESOURCES[name]?.[method];
		if (subresource !== undefined) {
			return notImplementedOperation(subresource);
		}
	}
	return undefined;
}

export function detectObjectOperation(
	c: S3Context,
	params: URLSearchParams
): ObjectOperation | Response {
	const method = c.req.method;

	if (params.has("uploadId") && method === "GET") {
		// Real R2 implements ListParts; the local R2 binding cannot list parts
		return notImplementedOperation("ListParts");
	}
	if (params.has("uploads") && method === "GET") {
		// Serve the bucket's upload list even on object paths
		return notImplementedOperation("ListMultipartUploads");
	}
	switch (method) {
		case "GET":
		case "HEAD":
			// Real R2 serves individual parts; `bucket.get()` cannot
			if (params.has("partNumber")) {
				return notImplementedOperation("partNumber");
			}

			if (method === "HEAD") {
				// Real R2 HEAD ignores subresource parameters
				return "HeadObject";
			}

			return objectSubresourceError(params, method) ?? "GetObject";
		case "PUT": {
			const subresource = objectSubresourceError(params, method);
			if (subresource !== undefined) {
				return subresource;
			}

			return c.req.header("x-amz-copy-source") !== undefined
				? "CopyObject"
				: "PutObject";
		}
		case "POST":
			// R2 treats POST on an object key as PutObject, ignoring
			// subresource parameters. Unlike PUT, x-amz-copy-source does NOT
			// make it a CopyObject: R2 ignores the header and stores the
			// request body.
			return "PutObject";
		case "DELETE":
			return "DeleteObject";
		default:
			return routeNotFound();
	}
}
