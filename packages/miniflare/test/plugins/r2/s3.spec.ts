import { Sha256 } from "@aws-crypto/sha256-js";
import {
	GetObjectCommand,
	HeadObjectCommand,
	ListMultipartUploadsCommand,
	ListPartsCommand,
	S3Client,
	S3ServiceException,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { SignatureV4 } from "@smithy/signature-v4";
import { Miniflare } from "miniflare";
import { assert, onTestFinished, test } from "vitest";
import { miniflareTest } from "../../test-shared";
import type { MiniflareTestContext } from "../../test-shared";
import type { R2Bucket } from "@cloudflare/workers-types/experimental";
import type { ExpectStatic } from "vitest";

// Operations are exercised through the official AWS SDK to prove client
// interop. Requests the SDK cannot produce (forged payload hashes, malformed
// bodies, unsupported headers) are signed directly with @smithy/signature-v4
// via `s3Fetch()`.

const CREDENTIALS = {
	accessKeyId: "A".repeat(32),
	secretAccessKey: "test-secret-key",
};
const THIRD_CREDENTIALS = {
	accessKeyId: "C".repeat(32),
	secretAccessKey: "third-secret-key",
};

const ctx = miniflareTest<{ BUCKET: R2Bucket }, MiniflareTestContext>(
	{
		r2Buckets: {
			BUCKET: { id: "bucket", s3Credentials: CREDENTIALS },
			OTHER: { id: "other-bucket", s3Credentials: CREDENTIALS },
			THIRD: { id: "third-bucket", s3Credentials: THIRD_CREDENTIALS },
		},
	},
	async (global) => new global.Response(null, { status: 404 })
);

function s3Url(path: string): URL {
	return new URL(`/cdn-cgi/local/r2/s3/${path}`, ctx.url);
}

function s3(options: { credentials?: typeof CREDENTIALS } = {}): S3Client {
	const client = new S3Client({
		region: "auto",
		endpoint: s3Url("").href,
		credentials: options.credentials ?? CREDENTIALS,
		forcePathStyle: true,
	});

	// The SDK sends `Expect: 100-continue` on requests with bodies, but
	// workerd never responds with `100 Continue`, so the SDK would wait for it
	// indefinitely before sending the body
	client.middlewareStack.remove("addExpectContinueMiddleware");
	onTestFinished(() => client.destroy());
	return client;
}

async function expectSdkError(
	promise: Promise<unknown>,
	status: number,
	code: string,
	expect: ExpectStatic
) {
	const error = await promise.then(
		() => undefined,
		(e: unknown) => e
	);
	assert(error instanceof S3ServiceException);
	expect(error.$metadata.httpStatusCode).toBe(status);
	expect(error.name).toBe(code);
	return error;
}

function bucket() {
	return ctx.mf.getR2Bucket("BUCKET");
}
function toAmzDate(date: Date): string {
	return date
		.toISOString()
		.replace(/[-:]/g, "")
		.replace(/\.\d{3}/, "");
}

interface S3FetchOptions {
	method?: string;
	headers?: Record<string, string>;
	body?: string | Uint8Array;
	/** Overrides the signed payload hash (for mismatch tests) */
	payloadHash?: string;
	credentials?: typeof CREDENTIALS;
}

async function s3Fetch(path: string, opts: S3FetchOptions = {}) {
	const url = s3Url(path);
	const method = opts.method ?? "GET";
	const body = opts.body ?? "";

	const signer = new SignatureV4({
		credentials: opts.credentials ?? CREDENTIALS,
		region: "auto",
		service: "s3",
		sha256: Sha256,
		// S3 canonical URIs are single-encoded (the path as sent)
		uriEscapePath: false,
		applyChecksum: true,
	});
	const query: Record<string, string[]> = {};
	for (const [name, value] of url.searchParams) {
		(query[name] ??= []).push(value);
	}
	const signed = await signer.sign({
		method,
		protocol: url.protocol,
		hostname: url.hostname,
		port: url.port === "" ? undefined : Number(url.port),
		path: url.pathname,
		query,
		headers: {
			host: url.host,
			...opts.headers,
			// A pre-set payload hash is signed as-is, so a wrong hash here
			// makes the signature cover a hash the body won't match
			...(opts.payloadHash !== undefined && {
				"x-amz-content-sha256": opts.payloadHash,
			}),
		},
		body,
	});

	return fetch(url, {
		method,
		headers: signed.headers,
		body: method === "GET" || method === "HEAD" ? undefined : body,
	});
}

async function expectError(
	res: Response,
	status: number,
	code: string,
	expect: ExpectStatic
) {
	expect(res.status).toBe(status);
	expect(await res.text()).toContain(`<Code>${code}</Code>`);
}

test("rejects anonymous requests", async ({ expect }) => {
	const res = await fetch(s3Url("bucket/key.txt"));
	expect(res.status).toBe(400);
	expect(await res.text()).toContain(
		"<Code>InvalidArgument</Code><Message>Authorization</Message>"
	);
});

test("rejects a wrong secret with SignatureDoesNotMatch", async ({
	expect,
}) => {
	const client = s3({
		credentials: { ...CREDENTIALS, secretAccessKey: "wrong" },
	});
	const error = await expectSdkError(
		client.send(new GetObjectCommand({ Bucket: "bucket", Key: "key.txt" })),
		403,
		"SignatureDoesNotMatch",
		expect
	);
	expect(error.message).toBe(
		"The request signature we calculated does not match the signature you provided. Check your secret access key and signing method."
	);
});

test("rejects an unknown access key id with 401 Unauthorized", async ({
	expect,
}) => {
	const client = s3({
		credentials: { ...CREDENTIALS, accessKeyId: "B".repeat(32) },
	});
	await expectSdkError(
		client.send(new GetObjectCommand({ Bucket: "bucket", Key: "key.txt" })),
		401,
		"Unauthorized",
		expect
	);
});

test("accepts valid header auth", async ({ expect }) => {
	await expectSdkError(
		s3().send(new GetObjectCommand({ Bucket: "bucket", Key: "missing.txt" })),
		404,
		"NoSuchKey",
		expect
	);
});

test("requires x-amz-content-sha256", async ({ expect }) => {
	const url = s3Url("bucket/key.txt");
	const res = await fetch(url, {
		headers: { authorization: "AWS4-HMAC-SHA256 garbage" },
	});
	expect(res.status).toBe(400);
	expect(await res.text()).toContain("Missing x-amz-content-sha256");
});

test("rejects a skewed request time", async ({ expect }) => {
	const url = s3Url("bucket/key.txt");
	const amzDate = toAmzDate(new Date(Date.now() - 3600_000));
	const res = await fetch(url, {
		headers: {
			authorization: `AWS4-HMAC-SHA256 Credential=${CREDENTIALS.accessKeyId}/${amzDate.slice(0, 8)}/auto/s3/aws4_request, SignedHeaders=host, Signature=${"0".repeat(64)}`,
			"x-amz-date": amzDate,
			"x-amz-content-sha256": "UNSIGNED-PAYLOAD",
		},
	});
	await expectError(res, 403, "RequestTimeTooSkewed", expect);
});

test("reports date errors like R2", async ({ expect }) => {
	const url = s3Url("bucket/key.txt");
	const amzDate = toAmzDate(new Date());
	const day = amzDate.slice(0, 8);
	const sha = { "x-amz-content-sha256": "UNSIGNED-PAYLOAD" };
	const authorization = `AWS4-HMAC-SHA256 Credential=${CREDENTIALS.accessKeyId}/${day}/auto/s3/aws4_request, SignedHeaders=host;x-amz-date, Signature=${"0".repeat(64)}`;

	const noDate = await fetch(url, { headers: { ...sha, authorization } });
	expect(noDate.status).toBe(400);
	expect(await noDate.text()).toContain(
		"<Message>No date provided in x-amz-date nor date header</Message>"
	);

	// The `date` header is a fallback, but accepts only ISO 8601 basic
	// format too (RFC 1123 dates are rejected)
	const rfc1123Date = new Date().toUTCString();
	const rfc1123 = await fetch(url, {
		headers: { ...sha, authorization, date: rfc1123Date },
	});
	expect(rfc1123.status).toBe(400);
	expect(await rfc1123.text()).toContain(
		`<Message>Date provided in &apos;date&apos; header (${rfc1123Date}) didn&apos;t parse successfully</Message>`
	);

	const extendedIso = await fetch(url, {
		headers: { ...sha, authorization, "x-amz-date": "2026-06-12T00:00:00Z" },
	});
	expect(extendedIso.status).toBe(400);
	expect(await extendedIso.text()).toContain(
		"<Message>Date provided in &apos;x-amz-date&apos; header (2026-06-12T00:00:00Z) didn&apos;t parse successfully</Message>"
	);
});

test("reports credential scope errors like R2", async ({ expect }) => {
	const url = s3Url("bucket/key.txt");
	const amzDate = toAmzDate(new Date());
	const day = amzDate.slice(0, 8);
	const headers = (authorization: string) => ({
		"x-amz-content-sha256": "UNSIGNED-PAYLOAD",
		"x-amz-date": amzDate,
		authorization,
	});
	const auth = (credential: string, signedHeaders = "host;x-amz-date") =>
		`AWS4-HMAC-SHA256 Credential=${credential}, SignedHeaders=${signedHeaders}, Signature=${"0".repeat(64)}`;

	// Non-SigV4 schemes and missing SigV4 fields get the algorithm error
	const basic = await fetch(url, { headers: headers("Basic dXNlcjpwYXNz") });
	expect(basic.status).toBe(400);
	expect(await basic.text()).toContain(
		"<Code>InvalidRequest</Code><Message>Please use AWS4-HMAC-SHA256</Message>"
	);

	const short = await fetch(url, {
		headers: headers(auth(`${CREDENTIALS.accessKeyId}/${day}/auto`)),
	});
	expect(short.status).toBe(400);
	expect(await short.text()).toContain(
		"<Message>Credential sigv4 header should have at least 5 slash-separated parts, not 3</Message>"
	);

	const service = await fetch(url, {
		headers: headers(
			auth(`${CREDENTIALS.accessKeyId}/${day}/auto/sqs/aws4_request`)
		),
	});
	expect(service.status).toBe(400);
	expect(await service.text()).toContain(
		"<Message>Credential service should be s3, not sqs</Message>"
	);

	const terminator = await fetch(url, {
		headers: headers(auth(`${CREDENTIALS.accessKeyId}/${day}/auto/s3/wat`)),
	});
	expect(terminator.status).toBe(400);
	expect(await terminator.text()).toContain(
		"<Message>Credential termination string should be aws4_request, not wat</Message>"
	);

	const staleScope = await fetch(url, {
		headers: headers(
			auth(`${CREDENTIALS.accessKeyId}/19990101/auto/s3/aws4_request`)
		),
	});
	expect(staleScope.status).toBe(400);
	expect(await staleScope.text()).toContain(
		`<Message>Credential signed date 19990101 does not match ${day} from &apos;x-amz-date&apos; header</Message>`
	);

	// SignedHeaders must include host
	const noHost = await fetch(url, {
		headers: headers(
			auth(
				`${CREDENTIALS.accessKeyId}/${day}/auto/s3/aws4_request`,
				"x-amz-date"
			)
		),
	});
	await expectError(noHost, 401, "Unauthorized", expect);
});

test("rejects x-amz-security-token", async ({ expect }) => {
	const res = await s3Fetch("bucket/key.txt", {
		headers: { "x-amz-security-token": "bogus" },
	});
	expect(res.status).toBe(400);
	expect(await res.text()).toContain("<Message>X-Amz-Security-Token</Message>");
});

test("serves presigned GETs", async ({ expect }) => {
	const r2 = await bucket();
	await r2.put("presigned.txt", "presigned content");
	const url = await getSignedUrl(
		s3(),
		new GetObjectCommand({ Bucket: "bucket", Key: "presigned.txt" })
	);
	const res = await fetch(url);
	expect(res.status).toBe(200);
	expect(await res.text()).toBe("presigned content");
});

test("rejects an empty X-Amz-Expires as not a number", async ({ expect }) => {
	const url = s3Url("bucket/key.txt");
	url.search = new URLSearchParams({
		"X-Amz-Algorithm": "AWS4-HMAC-SHA256",
		"X-Amz-Date": "20260612T000000Z",
		"X-Amz-Expires": "",
		"X-Amz-SignedHeaders": "host",
		"X-Amz-Signature": "abc",
		"X-Amz-Credential": `${CREDENTIALS.accessKeyId}/20260612/auto/s3/aws4_request`,
	}).toString();
	const res = await fetch(url);
	expect(res.status).toBe(400);
	expect(await res.text()).toContain(
		"<Message>X-Amz-Expires should be a number</Message>"
	);
});

test("rejects expired presigned URLs", async ({ expect }) => {
	const url = await getSignedUrl(
		s3(),
		new GetObjectCommand({ Bucket: "bucket", Key: "presigned.txt" }),
		{ expiresIn: 60, signingDate: new Date(Date.now() - 3600_000) }
	);
	const res = await fetch(url);
	await expectError(res, 403, "ExpiredRequest", expect);
});

test("rejects presigned URLs with too-long expiry", async ({ expect }) => {
	const signed = await getSignedUrl(
		s3(),
		new GetObjectCommand({ Bucket: "bucket", Key: "presigned.txt" })
	);
	const url = new URL(signed);
	url.searchParams.set("X-Amz-Expires", "700000");
	const res = await fetch(url);
	expect(res.status).toBe(400);
	expect(await res.text()).toContain("X-Amz-Expires must be less than a week");
});

test("rejects tampered presigned URLs", async ({ expect }) => {
	const signed = await getSignedUrl(
		s3(),
		new GetObjectCommand({ Bucket: "bucket", Key: "presigned.txt" })
	);
	const url = new URL(signed);
	url.pathname = url.pathname.replace("presigned", "evil");
	const res = await fetch(url);
	await expectError(res, 403, "SignatureDoesNotMatch", expect);
	// (re-fetch since expectError consumed the body)
	const body = await (await fetch(url)).text();
	expect(body).toContain("<StringToSign>");
	expect(body).toContain("<CanonicalRequest>");
	expect(body).toContain("<SignatureProvided>");
});

test("reports missing presigned parameters together", async ({ expect }) => {
	const url = s3Url("bucket/key.txt");
	url.searchParams.set(
		"X-Amz-Credential",
		`${CREDENTIALS.accessKeyId}/20260611/auto/s3/aws4_request`
	);
	url.searchParams.set("X-Amz-Date", "20260611T000000Z");
	url.searchParams.set("X-Amz-Expires", "60");
	url.searchParams.set("X-Amz-SignedHeaders", "host");
	const res = await fetch(url);
	expect(res.status).toBe(400);
	expect(await res.text()).toContain(
		"Required search parameters X-Amz-Algorithm,  X-Amz-Signature missing"
	);
});

test("returns NoSuchBucket for an unknown bucket id", async ({ expect }) => {
	const res = await s3Fetch("not-a-bucket/key.txt");
	await expectError(res, 404, "NoSuchBucket", expect);

	// Unlike real R2 (where credentials are account-scoped and auth is
	// verified first), local credentials are per-bucket, so an unknown
	// bucket reports NoSuchBucket regardless of the signature
	const forged = await s3Fetch("not-a-bucket/key.txt", {
		credentials: { ...CREDENTIALS, secretAccessKey: "wrong-secret" },
	});
	await expectError(forged, 404, "NoSuchBucket", expect);

	// HEAD errors carry the status but no body
	const head = await s3Fetch("not-a-bucket/key.txt", { method: "HEAD" });
	expect(head.status).toBe(404);
	expect(await head.text()).toBe("");
});

test("HeadObject returns metadata with an empty body", async ({ expect }) => {
	const r2 = await bucket();
	await r2.put("head.txt", "abcde");
	const head = await s3().send(
		new HeadObjectCommand({ Bucket: "bucket", Key: "head.txt" })
	);
	expect(head.ContentLength).toBe(5);
});

test("GetObject returns NoSuchKey XML; HeadObject errors have no body", async ({
	expect,
}) => {
	const get = await s3Fetch("bucket/missing.txt");
	await expectError(get, 404, "NoSuchKey", expect);
	const head = await s3Fetch("bucket/missing.txt", { method: "HEAD" });
	expect(head.status).toBe(404);
	expect(await head.text()).toBe("");
	// The SDK models bodyless HEAD errors as NotFound
	await expectSdkError(
		s3().send(new HeadObjectCommand({ Bucket: "bucket", Key: "missing.txt" })),
		404,
		"NotFound",
		expect
	);
	// Auth errors on HEAD are bodyless too
	const headAuth = await s3Fetch("bucket/missing.txt", {
		method: "HEAD",
		credentials: {
			accessKeyId: CREDENTIALS.accessKeyId,
			secretAccessKey: "wrong-secret",
		},
	});
	expect(headAuth.status).toBe(403);
	expect(await headAuth.text()).toBe("");
});

test("conditional GETs return 304 and 412", async ({ expect }) => {
	const r2 = await bucket();
	const object = await r2.put("cond.txt", "x");
	assert(object !== null);

	// The SDK surfaces 304s as (unparseable, bodyless) errors
	const notModified = await s3()
		.send(
			new GetObjectCommand({
				Bucket: "bucket",
				Key: "cond.txt",
				IfNoneMatch: object.httpEtag,
			})
		)
		.then(
			() => undefined,
			(e: unknown) => e
		);
	assert(notModified instanceof S3ServiceException);
	expect(notModified.$metadata.httpStatusCode).toBe(304);

	await expectSdkError(
		s3().send(
			new GetObjectCommand({
				Bucket: "bucket",
				Key: "cond.txt",
				IfMatch: '"0123456789abcdef0123456789abcdef"',
			})
		),
		412,
		"PreconditionFailed",
		expect
	);
});

test("range requests work, including suffix ranges", async ({ expect }) => {
	const r2 = await bucket();
	await r2.put("range.txt", "0123456789");
	const client = s3();

	const partial = await client.send(
		new GetObjectCommand({
			Bucket: "bucket",
			Key: "range.txt",
			Range: "bytes=2-4",
		})
	);
	expect(partial.$metadata.httpStatusCode).toBe(206);
	assert(partial.Body !== undefined);
	expect(await partial.Body.transformToString()).toBe("234");
	expect(partial.ContentRange).toBe("bytes 2-4/10");

	const suffix = await client.send(
		new GetObjectCommand({
			Bucket: "bucket",
			Key: "range.txt",
			Range: "bytes=-3",
		})
	);
	assert(suffix.Body !== undefined);
	expect(await suffix.Body.transformToString()).toBe("789");
	expect(suffix.ContentRange).toBe("bytes 7-9/10");
});

test("rejects unsatisfiable and malformed ranges", async ({ expect }) => {
	const r2 = await bucket();
	await r2.put("range2.txt", "0123456789");

	await expectSdkError(
		s3().send(
			new GetObjectCommand({
				Bucket: "bucket",
				Key: "range2.txt",
				Range: "bytes=99999-",
			})
		),
		416,
		"InvalidRange",
		expect
	);

	const malformed = await s3Fetch("bucket/range2.txt", {
		headers: { Range: "bytes=zzz" },
	});
	expect(malformed.status).toBe(400);
	expect(await malformed.text()).toContain(
		"&apos;bytes=-suffix&apos;.&apos;</Message>"
	);

	const inverted = await s3Fetch("bucket/range2.txt", {
		headers: { Range: "bytes=5-2" },
	});
	expect(inverted.status).toBe(400);
	expect(await inverted.text()).toContain(
		"<Message>range must be positive.</Message>"
	);

	// A zero suffix length is unsatisfiable for any object
	const zeroSuffix = await s3Fetch("bucket/range2.txt", {
		headers: { Range: "bytes=-0" },
	});
	await expectError(zeroSuffix, 416, "InvalidRange", expect);
});

test("HEAD honors Range with a bodyless 206", async ({ expect }) => {
	const r2 = await bucket();
	await r2.put("head-range.txt", "0123456789");

	const res = await s3Fetch("bucket/head-range.txt", {
		method: "HEAD",
		headers: { Range: "bytes=0-4" },
	});
	expect(res.status).toBe(206);
	expect(res.headers.get("Content-Range")).toBe("bytes 0-4/10");
	expect(res.headers.get("Content-Length")).toBe("5");
	expect(await res.text()).toBe("");
});

test("unimplemented multipart surfaces respond with NotImplemented", async ({
	expect,
}) => {
	const client = s3();
	await expectSdkError(
		client.send(new ListMultipartUploadsCommand({ Bucket: "bucket" })),
		501,
		"NotImplemented",
		expect
	);

	await expectSdkError(
		client.send(
			new ListPartsCommand({
				Bucket: "bucket",
				Key: "mp/x.bin",
				UploadId: "any",
			})
		),
		501,
		"NotImplemented",
		expect
	);

	const r2 = await bucket();
	await r2.put("mp/pn.txt", "x");
	await expectSdkError(
		client.send(
			new GetObjectCommand({
				Bucket: "bucket",
				Key: "mp/pn.txt",
				PartNumber: 1,
			})
		),
		501,
		"NotImplemented",
		expect
	);
});

// ## Recognized-but-unimplemented surfaces (messages match real R2)

test("bucket subresource GETs return R2's templated errors", async ({
	expect,
}) => {
	const policy = await s3Fetch("bucket?policy");
	expect(policy.status).toBe(501);
	expect(await policy.text()).toContain(
		"<Message>GetBucketPolicy not implemented</Message>"
	);

	const versions = await s3Fetch("bucket?versions");
	expect(versions.status).toBe(501);
	expect(await versions.text()).toContain(
		"<Message>ListObjectVersions not implemented</Message>"
	);

	const tiering = await s3Fetch("bucket?intelligent-tiering");
	expect(tiering.status).toBe(501);
	expect(await tiering.text()).toContain(
		"<Message>GetBucketIntelligentTieringConfiguration not implemented</Message>"
	);

	const policyStatus = await s3Fetch("bucket?policyStatus");
	expect(policyStatus.status).toBe(501);
	expect(await policyStatus.text()).toContain(
		"<Message>GetGetBucketPolicyStatus not implemented</Message>"
	);
});

test("unroutable requests match R2's responses", async ({ expect }) => {
	const patch = await s3Fetch("bucket/x.txt", { method: "PATCH" });
	expect(patch.status).toBe(404);
	expect(await patch.text()).toContain(
		"<Code>RouteNotFound</Code><Message>No route matches this url.</Message>"
	);

	// R2 responds 200 to a plain *signed* bucket-level POST
	const post = await s3Fetch("bucket", { method: "POST" });
	expect(post.status).toBe(200);
	expect(await post.text()).toBe("");

	// An unsigned bucket-level POST is an attempted browser form upload
	// (AWS's POST Object, with auth in the form fields); R2 recognizes the
	// shape but does not implement it, with a doubled "not implemented"
	// (theirs, verbatim)
	const form = new FormData();
	form.set("key", "form.txt");
	const unsignedPost = await fetch(s3Url("bucket"), {
		method: "POST",
		body: form,
	});
	expect(unsignedPost.status).toBe(501);
	expect(await unsignedPost.text()).toContain(
		"<Message>Presigned post requests are not yet implemented not implemented</Message>"
	);

	// CreateBucket is meaningless locally (buckets come from config)
	const put = await s3Fetch("bucket", { method: "PUT" });
	expect(put.status).toBe(501);
	expect(await put.text()).toContain(
		"<Message>CreateBucket not implemented</Message>"
	);
});

test("bucket-level PUT/DELETE subresources match real R2's routing", async ({
	expect,
}) => {
	// A recognized subresource wins, in any position
	const putTagging = await s3Fetch("bucket?junk&tagging", { method: "PUT" });
	expect(putTagging.status).toBe(501);
	expect(await putTagging.text()).toContain(
		"<Message>PutBucketTagging not implemented</Message>"
	);

	const deletePolicy = await s3Fetch("bucket?policy", { method: "DELETE" });
	expect(deletePolicy.status).toBe(501);
	expect(await deletePolicy.text()).toContain(
		"<Message>DeleteBucketPolicy not implemented</Message>"
	);

	// Subresources for other methods and unknown params are all rejected
	// together with R2's bucket-route error
	const deleteVersioning = await s3Fetch("bucket?versioning&junk", {
		method: "DELETE",
	});
	expect(deleteVersioning.status).toBe(400);
	expect(await deleteVersioning.text()).toContain(
		"<Message>Unsupported search param(s) &quot;versioning&quot;, &quot;junk&quot; on a DELETE bucket route</Message>"
	);

	const putJunk = await s3Fetch("bucket?junk", { method: "PUT" });
	expect(putJunk.status).toBe(400);
	expect(await putJunk.text()).toContain(
		"<Message>Unsupported search param(s) &quot;junk&quot; on a PUT bucket route</Message>"
	);
});

// Unlike real R2 (which only answers preflights according to the bucket's
// CORS configuration), the local endpoint always allows cross-origin use so
// browser requests (e.g. presigned uploads from a frontend dev server) work

test("answers CORS preflights, including for presigned browser uploads", async ({
	expect,
}) => {
	const res = await fetch(s3Url("bucket/upload.bin"), {
		method: "OPTIONS",
		headers: {
			Origin: "http://localhost:3000",
			"Access-Control-Request-Method": "PUT",
			"Access-Control-Request-Headers": "authorization,x-amz-date,content-type",
		},
	});
	expect(res.status).toBe(204);
	expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
	expect(res.headers.get("Access-Control-Allow-Methods")).toContain("PUT");
	expect(res.headers.get("Access-Control-Allow-Headers")).toBe(
		"authorization,x-amz-date,content-type"
	);
});

test("sets CORS headers on cross-origin responses", async ({ expect }) => {
	const r2 = await bucket();
	await r2.put("cors.txt", "x");
	const res = await s3Fetch("bucket/cors.txt", {
		headers: { Origin: "http://localhost:3000" },
	});
	expect(res.status).toBe(200);
	expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
	expect(res.headers.get("Access-Control-Expose-Headers")).toBe("*");
});

test("rejects different s3Credentials for the same bucket", async ({
	expect,
}) => {
	const mf = new Miniflare({
		workers: [
			{
				name: "a",
				modules: true,
				script: "export default {};",
				r2Buckets: { BUCKET: { id: "shared", s3Credentials: CREDENTIALS } },
			},
			{
				name: "b",
				modules: true,
				script: "export default {};",
				r2Buckets: {
					BUCKET: {
						id: "shared",
						s3Credentials: {
							accessKeyId: "B".repeat(32),
							secretAccessKey: "other-secret",
						},
					},
				},
			},
		],
	});
	await expect(mf.ready).rejects.toThrow(
		'Bucket "shared" is bound by multiple Workers with different S3 credentials'
	);
	// dispose() would re-await the failed init and rethrow
	await mf.dispose().catch(() => {});
});

test("verifies signatures against the original host when `upstream` is set", async ({
	expect,
}) => {
	// With `upstream` configured, the entry worker rewrites the request URL
	// and Host header before dispatching to the S3 service; signatures must
	// still be verified against the host the client signed
	const mf = new Miniflare({
		modules: true,
		script:
			"export default { fetch: () => new Response(null, { status: 404 }) };",
		r2Buckets: { BUCKET: { id: "bucket", s3Credentials: CREDENTIALS } },
		upstream: "https://example.com/",
	});
	onTestFinished(() => mf.dispose());
	const url = await mf.ready;
	const r2 = await mf.getR2Bucket("BUCKET");
	await r2.put("up.txt", "upstream");

	const client = new S3Client({
		region: "auto",
		endpoint: new URL("/cdn-cgi/local/r2/s3/", url).href,
		credentials: CREDENTIALS,
		forcePathStyle: true,
	});
	client.middlewareStack.remove("addExpectContinueMiddleware");
	onTestFinished(() => client.destroy());

	const res = await client.send(
		new GetObjectCommand({ Bucket: "bucket", Key: "up.txt" })
	);
	assert(res.Body !== undefined);
	expect(await res.Body.transformToString()).toBe("upstream");
});
