import crypto from "node:crypto";
import { Sha256 } from "@aws-crypto/sha256-js";
import {
	AbortMultipartUploadCommand,
	CompleteMultipartUploadCommand,
	CopyObjectCommand,
	CreateMultipartUploadCommand,
	DeleteObjectCommand,
	DeleteObjectsCommand,
	GetObjectCommand,
	GetBucketEncryptionCommand,
	GetBucketLocationCommand,
	GetBucketVersioningCommand,
	HeadBucketCommand,
	HeadObjectCommand,
	ListMultipartUploadsCommand,
	ListBucketsCommand,
	ListObjectsCommand,
	ListObjectsV2Command,
	ListPartsCommand,
	PutObjectCommand,
	S3Client,
	S3ServiceException,
	UploadPartCommand,
	UploadPartCopyCommand,
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
function sha256Hex(data: string | Uint8Array): string {
	return crypto.createHash("sha256").update(data).digest("hex");
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

test("detects a payload hash mismatch", async ({ expect }) => {
	const res = await s3Fetch("bucket/hash.txt", {
		method: "PUT",
		body: "actual body",
		payloadHash: sha256Hex("a different body"),
	});
	await expectError(res, 400, "XAmzContentSHA256Mismatch", expect);

	// The UNSIGNED-PAYLOAD sentinel skips body verification entirely
	const unsigned = await s3Fetch("bucket/hash.txt", {
		method: "PUT",
		body: "any body at all",
		payloadHash: "UNSIGNED-PAYLOAD",
	});
	expect(unsigned.status).toBe(200);
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

test("supports presigned PUTs", async ({ expect }) => {
	const url = await getSignedUrl(
		s3(),
		new PutObjectCommand({ Bucket: "bucket", Key: "presigned-put.txt" })
	);
	const res = await fetch(url, { method: "PUT", body: "uploaded" });
	expect(res.status).toBe(200);
	const r2 = await bucket();
	const object = await r2.get("presigned-put.txt");
	assert(object !== null);
	expect(await object.text()).toBe("uploaded");
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

test("PutObject stores body, metadata, and returns the ETag", async ({
	expect,
}) => {
	const client = s3();
	const put = await client.send(
		new PutObjectCommand({
			Bucket: "bucket",
			Key: "put.txt",
			Body: "0123456789",
			ContentType: "text/markdown",
			CacheControl: "max-age=60",
			Metadata: { hello: "world" },
		})
	);
	expect(put.ETag).toBe(
		`"${crypto.createHash("md5").update("0123456789").digest("hex")}"`
	);

	const get = await client.send(
		new GetObjectCommand({ Bucket: "bucket", Key: "put.txt" })
	);
	assert(get.Body !== undefined);
	expect(await get.Body.transformToString()).toBe("0123456789");
	expect(get.ContentType).toBe("text/markdown");
	expect(get.CacheControl).toBe("max-age=60");
	expect(get.Metadata).toEqual({ hello: "world" });
	expect(get.AcceptRanges).toBe("bytes");
});

test("round-trips special-character keys", async ({ expect }) => {
	// Exercises canonical-URI handling: the S3 canonical URI is the
	// percent-encoded path exactly as sent, never re-encoded
	const key = "späcial dir/key with spaces+(parens)&'quote.txt";
	const client = s3();
	await client.send(
		new PutObjectCommand({ Bucket: "bucket", Key: key, Body: "special" })
	);

	const get = await client.send(
		new GetObjectCommand({ Bucket: "bucket", Key: key })
	);
	assert(get.Body !== undefined);
	expect(await get.Body.transformToString()).toBe("special");

	// The stored key is the decoded form
	const r2 = await bucket();
	const object = await r2.get(key);
	expect(await object?.text()).toBe("special");

	// Keys containing `%` must be decoded exactly once
	const percentKey = "literal 100%/a%2Bb.txt";
	await client.send(
		new PutObjectCommand({ Bucket: "bucket", Key: percentKey, Body: "percent" })
	);
	const percent = await client.send(
		new GetObjectCommand({ Bucket: "bucket", Key: percentKey })
	);
	assert(percent.Body !== undefined);
	expect(await percent.Body.transformToString()).toBe("percent");
	expect(await (await r2.get(percentKey))?.text()).toBe("percent");
});

test("POST on an object key behaves like PutObject (R2 quirk)", async ({
	expect,
}) => {
	const res = await s3Fetch("bucket/posted.txt", {
		method: "POST",
		body: "posted",
	});
	expect(res.status).toBe(200);
	const get = await s3Fetch("bucket/posted.txt");
	expect(await get.text()).toBe("posted");

	const r2 = await bucket();
	await r2.put("post-copy-source.txt", "source content");
	const postCopy = await s3Fetch("bucket/posted.txt", {
		method: "POST",
		body: "body wins",
		headers: { "x-amz-copy-source": "bucket/post-copy-source.txt" },
	});
	expect(postCopy.status).toBe(200);
	expect(await postCopy.text()).toBe("");
	const getCopy = await s3Fetch("bucket/posted.txt");
	expect(await getCopy.text()).toBe("body wins");
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

test("DeleteObject returns 204, even for missing keys", async ({ expect }) => {
	const r2 = await bucket();
	await r2.put("del.txt", "x");
	const client = s3();
	await client.send(
		new DeleteObjectCommand({ Bucket: "bucket", Key: "del.txt" })
	);
	expect(await r2.head("del.txt")).toBe(null);
	// Deleting a missing key still succeeds
	await client.send(
		new DeleteObjectCommand({ Bucket: "bucket", Key: "del.txt" })
	);
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

test("conditional PUTs return 412 on failure", async ({ expect }) => {
	const r2 = await bucket();
	await r2.put("cond-put.txt", "x");
	await expectSdkError(
		s3().send(
			new PutObjectCommand({
				Bucket: "bucket",
				Key: "cond-put.txt",
				Body: "y",
				IfNoneMatch: "*",
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

test("verifies Content-MD5", async ({ expect }) => {
	const good = await s3Fetch("bucket/md5.txt", {
		method: "PUT",
		body: "data",
		headers: {
			"Content-MD5": crypto.createHash("md5").update("data").digest("base64"),
		},
	});
	expect(good.status).toBe(200);

	const bad = await s3Fetch("bucket/md5.txt", {
		method: "PUT",
		body: "data",
		headers: {
			"Content-MD5": crypto.createHash("md5").update("other").digest("base64"),
		},
	});
	await expectError(bad, 400, "BadDigest", expect);

	const invalid = await s3Fetch("bucket/md5.txt", {
		method: "PUT",
		body: "data",
		headers: { "Content-MD5": "not-base64!!!" },
	});
	await expectError(invalid, 400, "InvalidDigest", expect);
});

test("validates x-amz-storage-class", async ({ expect }) => {
	const ok = await s3Fetch("bucket/sc.txt", {
		method: "PUT",
		body: "x",
		headers: { "x-amz-storage-class": "STANDARD" },
	});
	expect(ok.status).toBe(200);

	const ia = await s3Fetch("bucket/sc.txt", {
		method: "PUT",
		body: "x",
		headers: { "x-amz-storage-class": "STANDARD_IA" },
	});
	await expectError(ia, 501, "NotImplemented", expect);

	const bad = await s3Fetch("bucket/sc.txt", {
		method: "PUT",
		body: "x",
		headers: { "x-amz-storage-class": "GLACIER" },
	});
	await expectError(bad, 400, "InvalidStorageClass", expect);
});

test("screens unsupported headers per operation", async ({ expect }) => {
	// x-amz-tagging is rejected on PutObject...
	const put = await s3Fetch("bucket/screen.txt", {
		method: "PUT",
		body: "x",
		headers: { "x-amz-tagging": "a=b" },
	});
	expect(put.status).toBe(501);
	expect(await put.text()).toContain(
		"Header &apos;x-amz-tagging&apos; with value &apos;a=b&apos; not implemented"
	);

	// ...but ignored on GetObject
	const r2 = await bucket();
	await r2.put("screen.txt", "x");
	const get = await s3Fetch("bucket/screen.txt", {
		headers: { "x-amz-tagging": "a=b" },
	});
	expect(get.status).toBe(200);

	// x-amz-mfa is rejected on DeleteObject only
	const del = await s3Fetch("bucket/screen.txt", {
		method: "DELETE",
		headers: { "x-amz-mfa": "device 123456" },
	});
	expect(del.status).toBe(501);
	const putMfa = await s3Fetch("bucket/screen.txt", {
		method: "PUT",
		body: "x",
		headers: { "x-amz-mfa": "device 123456" },
	});
	expect(putMfa.status).toBe(200);
});

test("validates x-amz-acl and x-amz-server-side-encryption values", async ({
	expect,
}) => {
	const cannedAcl = await s3Fetch("bucket/acl.txt", {
		method: "PUT",
		body: "x",
		headers: { "x-amz-acl": "public-read" },
	});
	expect(cannedAcl.status).toBe(200);

	const badAcl = await s3Fetch("bucket/acl.txt", {
		method: "PUT",
		body: "x",
		headers: { "x-amz-acl": "lol-no" },
	});
	expect(badAcl.status).toBe(501);

	const aes = await s3Fetch("bucket/sse.txt", {
		method: "PUT",
		body: "x",
		headers: { "x-amz-server-side-encryption": "AES256" },
	});
	expect(aes.status).toBe(200);

	const kms = await s3Fetch("bucket/sse.txt", {
		method: "PUT",
		body: "x",
		headers: { "x-amz-server-side-encryption": "aws:kms" },
	});
	expect(kms.status).toBe(501);
});

test("ignores unrecognized x-amz-* headers", async ({ expect }) => {
	const res = await s3Fetch("bucket/unknown-header.txt", {
		method: "PUT",
		body: "x",
		headers: { "x-amz-foobar": "whatever" },
	});
	expect(res.status).toBe(200);
});

test("SSE-C reads get InvalidRequest, writes get NotImplemented", async ({
	expect,
}) => {
	const r2 = await bucket();
	await r2.put("ssec.txt", "x");
	const key = Buffer.alloc(32, 7).toString("base64");
	const keyMd5 = crypto
		.createHash("md5")
		.update(Buffer.alloc(32, 7))
		.digest("base64");
	const fullSet = {
		"x-amz-server-side-encryption-customer-algorithm": "AES256",
		"x-amz-server-side-encryption-customer-key": key,
		"x-amz-server-side-encryption-customer-key-MD5": keyMd5,
	};

	// Incomplete header triples are rejected before anything else
	const noKey = await s3Fetch("bucket/ssec.txt", {
		headers: { "x-amz-server-side-encryption-customer-algorithm": "AES256" },
	});
	expect(noKey.status).toBe(400);
	expect(await noKey.text()).toContain(
		"must provide an appropriate secret key."
	);

	const noMd5 = await s3Fetch("bucket/ssec.txt", {
		headers: {
			"x-amz-server-side-encryption-customer-algorithm": "AES256",
			"x-amz-server-side-encryption-customer-key": key,
		},
	});
	expect(noMd5.status).toBe(400);
	expect(await noMd5.text()).toContain(
		"must provide the client calculated MD5 of the secret key."
	);

	const noAlgorithm = await s3Fetch("bucket/ssec.txt", {
		headers: {
			"x-amz-server-side-encryption-customer-key": key,
			"x-amz-server-side-encryption-customer-key-MD5": keyMd5,
		},
	});
	expect(noAlgorithm.status).toBe(400);
	expect(await noAlgorithm.text()).toContain(
		"must provide a valid encryption algorithm."
	);

	// A complete triple with a bad algorithm value is rejected next, on
	// reads and writes alike (probed against R2)
	const badAlgorithm = await s3Fetch("bucket/ssec.txt", {
		headers: {
			...fullSet,
			"x-amz-server-side-encryption-customer-algorithm": "AES128",
		},
	});
	expect(badAlgorithm.status).toBe(400);
	expect(await badAlgorithm.text()).toContain(
		"<Code>InvalidEncryptionAlgorithmError</Code><Message>The encryption request that you specified is not valid. The valid value is AES256.</Message>"
	);

	const get = await s3Fetch("bucket/ssec.txt", { headers: fullSet });
	expect(get.status).toBe(400);
	expect(await get.text()).toContain(
		"The encryption parameters are not applicable to this object."
	);

	const put = await s3Fetch("bucket/ssec.txt", {
		method: "PUT",
		body: "x",
		headers: fullSet,
	});
	expect(put.status).toBe(501);
	expect(await put.text()).toContain(
		"x-amz-server-side-encryption-customer-algorithm"
	);
});

async function seedListKeys() {
	const r2 = await bucket();
	await r2.put("ls/a.txt", "aaa");
	await r2.put("ls/b.txt", "bbbb");
	await r2.put("ls/sub/c.txt", "cc");
}

test("ListObjectsV2 lists with prefix and KeyCount", async ({ expect }) => {
	await seedListKeys();
	const res = await s3().send(
		new ListObjectsV2Command({ Bucket: "bucket", Prefix: "ls/" })
	);
	expect(res.Name).toBe("bucket");
	expect(res.KeyCount).toBe(3);
	expect(res.IsTruncated).toBe(false);
	expect(res.Contents?.map((object) => object.Key)).toEqual([
		"ls/a.txt",
		"ls/b.txt",
		"ls/sub/c.txt",
	]);
	expect(res.Contents?.[0]?.Size).toBe(3);
	expect(res.Contents?.[0]?.StorageClass).toBe("STANDARD");
});

test("ListObjectsV2 groups keys with a delimiter", async ({ expect }) => {
	await seedListKeys();
	const res = await s3().send(
		new ListObjectsV2Command({
			Bucket: "bucket",
			Prefix: "ls/",
			Delimiter: "/",
		})
	);
	expect(res.Contents?.map((object) => object.Key)).toEqual([
		"ls/a.txt",
		"ls/b.txt",
	]);
	expect(res.CommonPrefixes).toEqual([{ Prefix: "ls/sub/" }]);
});

test("ListObjectsV2 paginates with continuation tokens", async ({ expect }) => {
	await seedListKeys();
	const client = s3();
	const first = await client.send(
		new ListObjectsV2Command({ Bucket: "bucket", Prefix: "ls/", MaxKeys: 2 })
	);
	expect(first.IsTruncated).toBe(true);
	assert(first.NextContinuationToken !== undefined);

	const second = await client.send(
		new ListObjectsV2Command({
			Bucket: "bucket",
			Prefix: "ls/",
			MaxKeys: 2,
			ContinuationToken: first.NextContinuationToken,
		})
	);
	expect(second.Contents?.map((object) => object.Key)).toEqual([
		"ls/sub/c.txt",
	]);
	expect(second.IsTruncated).toBe(false);
});

test("ListObjectsV2 honors start-after", async ({ expect }) => {
	await seedListKeys();
	const res = await s3().send(
		new ListObjectsV2Command({
			Bucket: "bucket",
			Prefix: "ls/",
			StartAfter: "ls/b.txt",
		})
	);
	expect(res.Contents?.map((object) => object.Key)).toEqual(["ls/sub/c.txt"]);
});

test("ListObjects (V1) supports Marker", async ({ expect }) => {
	await seedListKeys();
	const res = await s3().send(
		new ListObjectsCommand({
			Bucket: "bucket",
			Prefix: "ls/",
			Marker: "ls/a.txt",
		})
	);
	expect(res.Marker).toBe("ls/a.txt");
	expect(res.Contents?.map((object) => object.Key)).toEqual([
		"ls/b.txt",
		"ls/sub/c.txt",
	]);
});

test("ListObjects (V1) NextMarker can be a CommonPrefix", async ({
	expect,
}) => {
	const r2 = await bucket();
	await r2.put("nm/a.txt", "a");
	await r2.put("nm/sub/c.txt", "c");
	await r2.put("nm/z.txt", "z");

	const res = await s3().send(
		new ListObjectsCommand({
			Bucket: "bucket",
			Prefix: "nm/",
			Delimiter: "/",
			MaxKeys: 2,
		})
	);
	expect(res.IsTruncated).toBe(true);
	expect(res.Contents?.map((object) => object.Key)).toEqual(["nm/a.txt"]);
	expect(res.CommonPrefixes?.map((p) => p.Prefix)).toEqual(["nm/sub/"]);
	expect(res.NextMarker).toBe("nm/sub/");
});

test("encoding-type=url encodes keys", async ({ expect }) => {
	await seedListKeys();
	const res = await s3Fetch(
		"bucket?list-type=2&prefix=ls/sub&encoding-type=url"
	);
	const text = await res.text();
	expect(text).toContain("<Key>ls%2Fsub%2Fc.txt</Key>");
	expect(text).toContain("<Prefix>ls%2Fsub</Prefix>");
	expect(text).toContain("<EncodingType>url</EncodingType>");
});

test("DeleteObjects deletes keys, reporting missing keys as Deleted", async ({
	expect,
}) => {
	const r2 = await bucket();
	await r2.put("batch/a.txt", "x");
	await r2.put("batch/b.txt", "x");
	const res = await s3().send(
		new DeleteObjectsCommand({
			Bucket: "bucket",
			Delete: {
				Objects: [
					{ Key: "batch/a.txt" },
					{ Key: "batch/b.txt" },
					{ Key: "batch/missing.txt" },
				],
			},
		})
	);
	expect(res.Deleted?.map((deleted) => deleted.Key)).toEqual([
		"batch/a.txt",
		"batch/b.txt",
		"batch/missing.txt",
	]);
	expect(await r2.head("batch/a.txt")).toBe(null);
	expect(await r2.head("batch/b.txt")).toBe(null);
});

test("DeleteObjects validates Quiet but ignores it", async ({ expect }) => {
	const r2 = await bucket();
	await r2.put("batch/q.txt", "x");
	// Unlike AWS S3, R2 returns the Deleted list even in quiet mode
	const res = await s3().send(
		new DeleteObjectsCommand({
			Bucket: "bucket",
			Delete: { Quiet: true, Objects: [{ Key: "batch/q.txt" }] },
		})
	);
	expect(res.Deleted?.map((deleted) => deleted.Key)).toEqual(["batch/q.txt"]);
	expect(await r2.head("batch/q.txt")).toBe(null);

	// Only literal true/false are accepted as Quiet values
	const invalid = await s3Fetch("bucket?delete", {
		method: "POST",
		body: "<Delete><Quiet>TRUE</Quiet><Object><Key>x</Key></Object></Delete>",
	});
	await expectError(invalid, 400, "MalformedXML", expect);
});

test("DeleteObjects rejects malformed XML", async ({ expect }) => {
	const res = await s3Fetch("bucket?delete", {
		method: "POST",
		body: "<NotDelete/>",
	});
	await expectError(res, 400, "MalformedXML", expect);

	// An empty object list is malformed too
	const empty = await s3Fetch("bucket?delete", {
		method: "POST",
		body: "<Delete></Delete>",
	});
	await expectError(empty, 400, "MalformedXML", expect);

	const missingKey = await s3Fetch("bucket?delete", {
		method: "POST",
		body: "<Delete><Object><NotKey>x</NotKey></Object></Delete>",
	});
	await expectError(missingKey, 400, "MalformedXML", expect);

	// At most 1000 keys per request
	const tooMany = await s3Fetch("bucket?delete", {
		method: "POST",
		body: `<Delete>${Array.from(
			{ length: 1001 },
			(_, i) => `<Object><Key>k${i}</Key></Object>`
		).join("")}</Delete>`,
	});
	await expectError(tooMany, 400, "MalformedXML", expect);
});

test("CopyObject copies an object, preserving metadata", async ({ expect }) => {
	const r2 = await bucket();
	await r2.put("copy/src.txt", "copy me", {
		httpMetadata: { contentType: "text/csv" },
		customMetadata: { original: "yes" },
	});
	const client = s3();
	const res = await client.send(
		new CopyObjectCommand({
			Bucket: "bucket",
			Key: "copy/dst.txt",
			CopySource: "/bucket/copy/src.txt",
		})
	);
	expect(res.CopyObjectResult?.ETag).toBeDefined();
	expect(res.CopyObjectResult?.LastModified).toBeDefined();

	const get = await client.send(
		new GetObjectCommand({ Bucket: "bucket", Key: "copy/dst.txt" })
	);
	assert(get.Body !== undefined);
	expect(await get.Body.transformToString()).toBe("copy me");
	expect(get.ContentType).toBe("text/csv");
	expect(get.Metadata).toEqual({ original: "yes" });
});

test("CopyObject REPLACE directive uses request metadata", async ({
	expect,
}) => {
	const r2 = await bucket();
	await r2.put("copy/src2.txt", "data", {
		httpMetadata: { contentType: "text/csv" },
	});
	const client = s3();
	await client.send(
		new CopyObjectCommand({
			Bucket: "bucket",
			Key: "copy/dst2.txt",
			CopySource: "/bucket/copy/src2.txt",
			MetadataDirective: "REPLACE",
			ContentType: "application/json",
			Metadata: { new: "1" },
		})
	);
	const get = await client.send(
		new GetObjectCommand({ Bucket: "bucket", Key: "copy/dst2.txt" })
	);
	expect(get.ContentType).toBe("application/json");
	expect(get.Metadata).toEqual({ new: "1" });
});

test("CopyObject works across buckets", async ({ expect }) => {
	const other = await ctx.mf.getR2Bucket("OTHER");
	await other.put("cross.txt", "from the other bucket");
	const client = s3();
	await client.send(
		new CopyObjectCommand({
			Bucket: "bucket",
			Key: "cross-copied.txt",
			CopySource: "/other-bucket/cross.txt",
		})
	);
	const get = await client.send(
		new GetObjectCommand({ Bucket: "bucket", Key: "cross-copied.txt" })
	);
	assert(get.Body !== undefined);
	expect(await get.Body.transformToString()).toBe("from the other bucket");
});

test("CopyObject error cases", async ({ expect }) => {
	const r2 = await bucket();
	await r2.put("copy/src3.txt", "x");
	const client = s3();

	await expectSdkError(
		client.send(
			new CopyObjectCommand({
				Bucket: "bucket",
				Key: "copy/dst3.txt",
				CopySource: "/bucket/copy/nope.txt",
			})
		),
		404,
		"NoSuchKey",
		expect
	);

	await expectSdkError(
		client.send(
			new CopyObjectCommand({
				Bucket: "bucket",
				Key: "copy/dst3.txt",
				CopySource: "/no-such-bucket/x.txt",
			})
		),
		404,
		"NoSuchBucket",
		expect
	);

	// third-bucket is configured with different credentials; the verified
	// pair must also grant access to the copy source
	await expectSdkError(
		client.send(
			new CopyObjectCommand({
				Bucket: "bucket",
				Key: "copy/dst3.txt",
				CopySource: "/third-bucket/x.txt",
			})
		),
		401,
		"Unauthorized",
		expect
	);

	await expectSdkError(
		client.send(
			new CopyObjectCommand({
				Bucket: "bucket",
				Key: "copy/dst3.txt",
				CopySource: "/bucket/copy/src3.txt",
				CopySourceIfMatch: '"0123456789abcdef0123456789abcdef"',
			})
		),
		412,
		"PreconditionFailed",
		expect
	);

	const badDirective = await s3Fetch("bucket/copy/dst3.txt", {
		method: "PUT",
		headers: {
			"x-amz-copy-source": "/bucket/copy/src3.txt",
			"x-amz-metadata-directive": "WAT",
		},
	});
	expect(badDirective.status).toBe(400);
	expect(await badDirective.text()).toContain("metadata directive WAT.");

	const badSource = await s3Fetch("bucket/copy/dst3.txt", {
		method: "PUT",
		headers: { "x-amz-copy-source": "no-slash" },
	});
	expect(badSource.status).toBe(400);
	expect(await badSource.text()).toContain("copy source bucket name");
});

test("CopyObject decodes the copy source and allows self-copies", async ({
	expect,
}) => {
	const r2 = await bucket();
	await r2.put("copy/sp ace.txt", "spaced");

	// Copy sources arrive percent-encoded
	const encoded = await s3Fetch("bucket/copy/dst-encoded.txt", {
		method: "PUT",
		headers: { "x-amz-copy-source": "/bucket/copy/sp%20ace.txt" },
	});
	expect(encoded.status).toBe(200);
	const copied = await r2.get("copy/dst-encoded.txt");
	expect(await copied?.text()).toBe("spaced");

	// Copying an object onto itself is allowed
	const self = await s3Fetch("bucket/copy/sp%20ace.txt", {
		method: "PUT",
		headers: { "x-amz-copy-source": "/bucket/copy/sp%20ace.txt" },
	});
	expect(self.status).toBe(200);
	expect(await self.text()).toContain("<CopyObjectResult");
	const after = await r2.get("copy/sp ace.txt");
	expect(await after?.text()).toBe("spaced");
});

test("multipart upload lifecycle", async ({ expect }) => {
	const client = s3();
	const create = await client.send(
		new CreateMultipartUploadCommand({
			Bucket: "bucket",
			Key: "mp/obj.bin",
			ContentType: "application/x-thing",
			Metadata: { mp: "1" },
		})
	);
	expect(create.Bucket).toBe("bucket");
	expect(create.Key).toBe("mp/obj.bin");
	assert(create.UploadId !== undefined);

	const part = await client.send(
		new UploadPartCommand({
			Bucket: "bucket",
			Key: "mp/obj.bin",
			UploadId: create.UploadId,
			PartNumber: 1,
			Body: "part-one-data",
		})
	);
	assert(part.ETag !== undefined);

	const complete = await client.send(
		new CompleteMultipartUploadCommand({
			Bucket: "bucket",
			Key: "mp/obj.bin",
			UploadId: create.UploadId,
			MultipartUpload: { Parts: [{ PartNumber: 1, ETag: part.ETag }] },
		})
	);
	expect(complete.Key).toBe("mp/obj.bin");
	expect(complete.Location).toContain("mp%2Fobj.bin");
	// Multipart ETags carry a part-count suffix
	expect(complete.ETag).toMatch(/^"[0-9a-f]{32}-1"$/);

	const get = await client.send(
		new GetObjectCommand({ Bucket: "bucket", Key: "mp/obj.bin" })
	);
	assert(get.Body !== undefined);
	expect(await get.Body.transformToString()).toBe("part-one-data");
	expect(get.ContentType).toBe("application/x-thing");
	expect(get.Metadata).toEqual({ mp: "1" });

	// The upload is gone after completion
	await expectSdkError(
		client.send(
			new CompleteMultipartUploadCommand({
				Bucket: "bucket",
				Key: "mp/obj.bin",
				UploadId: create.UploadId,
				MultipartUpload: { Parts: [{ PartNumber: 1, ETag: part.ETag }] },
			})
		),
		404,
		"NoSuchUpload",
		expect
	);
});

test("multipart error cases", async ({ expect }) => {
	const client = s3();
	await expectSdkError(
		client.send(
			new UploadPartCommand({
				Bucket: "bucket",
				Key: "mp/err.bin",
				UploadId: "bogus",
				PartNumber: 1,
				Body: "x",
			})
		),
		404,
		"NoSuchUpload",
		expect
	);

	await expectSdkError(
		client.send(
			new AbortMultipartUploadCommand({
				Bucket: "bucket",
				Key: "mp/err.bin",
				UploadId: "bogus",
			})
		),
		404,
		"NoSuchUpload",
		expect
	);

	const create = await client.send(
		new CreateMultipartUploadCommand({ Bucket: "bucket", Key: "mp/err.bin" })
	);
	assert(create.UploadId !== undefined);

	const badNumber = await expectSdkError(
		client.send(
			new UploadPartCommand({
				Bucket: "bucket",
				Key: "mp/err.bin",
				UploadId: create.UploadId,
				PartNumber: 0,
				Body: "x",
			})
		),
		400,
		"InvalidArgument",
		expect
	);
	expect(badNumber.message).toContain(
		"Part number must be an integer between 1 and 10000, inclusive."
	);

	const duplicate = await expectSdkError(
		client.send(
			new CompleteMultipartUploadCommand({
				Bucket: "bucket",
				Key: "mp/err.bin",
				UploadId: create.UploadId,
				MultipartUpload: {
					Parts: [
						{ PartNumber: 1, ETag: '"0123456789abcdef0123456789abcdef"' },
						{ PartNumber: 1, ETag: '"0123456789abcdef0123456789abcdef"' },
					],
				},
			})
		),
		400,
		"InvalidPart",
		expect
	);
	expect(duplicate.message).toBe(
		"There was a problem with the multipart upload."
	);

	await client.send(
		new UploadPartCommand({
			Bucket: "bucket",
			Key: "mp/err.bin",
			UploadId: create.UploadId,
			PartNumber: 1,
			Body: "data",
		})
	);
	await expectSdkError(
		client.send(
			new CompleteMultipartUploadCommand({
				Bucket: "bucket",
				Key: "mp/err.bin",
				UploadId: create.UploadId,
				MultipartUpload: {
					Parts: [
						{
							PartNumber: 1,
							ETag: '"0123456789abcdef0123456789abcdef"',
						},
					],
				},
			})
		),
		400,
		"InvalidPart",
		expect
	);

	const malformed = await s3Fetch(
		`bucket/mp/err.bin?uploadId=${encodeURIComponent(create.UploadId)}`,
		{ method: "POST", body: "<wat/>" }
	);
	await expectError(malformed, 400, "MalformedXML", expect);

	// R2's part routes only match integer-shaped partNumber values; padded
	// and zero-prefixed integers are accepted, anything else is RouteNotFound
	const uid = encodeURIComponent(create.UploadId);
	const padded = await s3Fetch(
		`bucket/mp/err.bin?uploadId=${uid}&partNumber=01`,
		{
			method: "PUT",
			body: "x",
		}
	);
	expect(padded.status).toBe(200);
	const fractional = await s3Fetch(
		`bucket/mp/err.bin?uploadId=${uid}&partNumber=1.0`,
		{ method: "PUT", body: "x" }
	);
	await expectError(fractional, 404, "RouteNotFound", expect);
	const empty = await s3Fetch(`bucket/mp/err.bin?uploadId=${uid}&partNumber=`, {
		method: "PUT",
		body: "x",
	});
	await expectError(empty, 400, "InvalidArgument", expect);

	// Inside the Complete XML (unlike the ?partNumber= query param), real R2
	// reports non-integer part numbers as MalformedXML and out-of-range
	// integers as InvalidPart (a part that does not exist)
	const uploadId = create.UploadId;
	const completeWith = (partNumber: string) =>
		s3Fetch(`bucket/mp/err.bin?uploadId=${encodeURIComponent(uploadId)}`, {
			method: "POST",
			body: `<CompleteMultipartUpload><Part><PartNumber>${partNumber}</PartNumber><ETag>"0123456789abcdef0123456789abcdef"</ETag></Part></CompleteMultipartUpload>`,
		});
	await expectError(await completeWith("abc"), 400, "MalformedXML", expect);
	await expectError(await completeWith("1.5"), 400, "MalformedXML", expect);
	await expectError(await completeWith("0"), 400, "InvalidPart", expect);
	await expectError(await completeWith("10001"), 400, "InvalidPart", expect);

	// An empty part list is malformed too
	const emptyComplete = await s3Fetch(
		`bucket/mp/err.bin?uploadId=${encodeURIComponent(uploadId)}`,
		{
			method: "POST",
			body: "<CompleteMultipartUpload></CompleteMultipartUpload>",
		}
	);
	await expectError(emptyComplete, 400, "MalformedXML", expect);

	await client.send(
		new AbortMultipartUploadCommand({
			Bucket: "bucket",
			Key: "mp/err.bin",
			UploadId: create.UploadId,
		})
	);

	await expectSdkError(
		client.send(
			new UploadPartCommand({
				Bucket: "bucket",
				Key: "mp/err.bin",
				UploadId: create.UploadId,
				PartNumber: 1,
				Body: "x",
			})
		),
		404,
		"NoSuchUpload",
		expect
	);
});

test("PUT with uploadId but no partNumber is a plain PutObject", async ({
	expect,
}) => {
	const client = s3();
	const create = await client.send(
		new CreateMultipartUploadCommand({ Bucket: "bucket", Key: "mp/plain.bin" })
	);
	assert(create.UploadId !== undefined);

	const res = await s3Fetch(
		`bucket/mp/plain.bin?uploadId=${encodeURIComponent(create.UploadId)}`,
		{ method: "PUT", body: "not-a-part" }
	);
	expect(res.status).toBe(200);

	// The object was written directly; the multipart upload saw no parts
	const r2 = await bucket();
	const object = await r2.get("mp/plain.bin");
	expect(await object?.text()).toBe("not-a-part");
	await client.send(
		new AbortMultipartUploadCommand({
			Bucket: "bucket",
			Key: "mp/plain.bin",
			UploadId: create.UploadId,
		})
	);
});

test("complete rejects non-final parts below the minimum size", async ({
	expect,
}) => {
	const client = s3();
	const create = await client.send(
		new CreateMultipartUploadCommand({ Bucket: "bucket", Key: "mp/small.bin" })
	);
	assert(create.UploadId !== undefined);

	const parts = [];
	for (const partNumber of [1, 2]) {
		const part = await client.send(
			new UploadPartCommand({
				Bucket: "bucket",
				Key: "mp/small.bin",
				UploadId: create.UploadId,
				PartNumber: partNumber,
				Body: `tiny${partNumber}`,
			})
		);
		parts.push({ PartNumber: partNumber, ETag: part.ETag });
	}
	await expectSdkError(
		client.send(
			new CompleteMultipartUploadCommand({
				Bucket: "bucket",
				Key: "mp/small.bin",
				UploadId: create.UploadId,
				MultipartUpload: { Parts: parts },
			})
		),
		400,
		"EntityTooSmall",
		expect
	);
	await client.send(
		new AbortMultipartUploadCommand({
			Bucket: "bucket",
			Key: "mp/small.bin",
			UploadId: create.UploadId,
		})
	);
});

test("UploadPartCopy copies a part, optionally with a range", async ({
	expect,
}) => {
	const r2 = await bucket();
	await r2.put("mp/copy-src.txt", "0123456789");
	const client = s3();

	const create = await client.send(
		new CreateMultipartUploadCommand({ Bucket: "bucket", Key: "mp/copied.bin" })
	);
	assert(create.UploadId !== undefined);

	const copied = await client.send(
		new UploadPartCopyCommand({
			Bucket: "bucket",
			Key: "mp/copied.bin",
			UploadId: create.UploadId,
			PartNumber: 1,
			CopySource: "/bucket/mp/copy-src.txt",
			CopySourceRange: "bytes=0-4",
		})
	);
	assert(copied.CopyPartResult?.ETag !== undefined);

	// Only `bytes=start-end` is accepted for x-amz-copy-source-range
	const badRange = await s3Fetch(
		`bucket/mp/copied.bin?uploadId=${encodeURIComponent(create.UploadId)}&partNumber=2`,
		{
			method: "PUT",
			headers: {
				"x-amz-copy-source": "/bucket/mp/copy-src.txt",
				"x-amz-copy-source-range": "bytes=0-",
			},
		}
	);
	expect(badRange.status).toBe(400);
	expect(await badRange.text()).toContain(
		"<Message>Invalid x-amz-copy-source-range: bytes=0-</Message>"
	);

	// Inverted ranges are rejected (out-of-bounds ends are clamped instead)
	const invertedRange = await s3Fetch(
		`bucket/mp/copied.bin?uploadId=${encodeURIComponent(create.UploadId)}&partNumber=2`,
		{
			method: "PUT",
			headers: {
				"x-amz-copy-source": "/bucket/mp/copy-src.txt",
				"x-amz-copy-source-range": "bytes=5-2",
			},
		}
	);
	expect(invertedRange.status).toBe(400);
	expect(await invertedRange.text()).toContain(
		"<Message>x-amz-copy-source-range must be positive.</Message>"
	);

	await client.send(
		new CompleteMultipartUploadCommand({
			Bucket: "bucket",
			Key: "mp/copied.bin",
			UploadId: create.UploadId,
			MultipartUpload: {
				Parts: [{ PartNumber: 1, ETag: copied.CopyPartResult.ETag }],
			},
		})
	);
	const get = await client.send(
		new GetObjectCommand({ Bucket: "bucket", Key: "mp/copied.bin" })
	);
	assert(get.Body !== undefined);
	expect(await get.Body.transformToString()).toBe("01234");
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

test("object subresource operations return R2's templated errors", async ({
	expect,
}) => {
	const r2 = await bucket();
	await r2.put("sub/x.txt", "x");

	const getTagging = await s3Fetch("bucket/sub/x.txt?tagging");
	expect(getTagging.status).toBe(501);
	expect(await getTagging.text()).toContain(
		"<Message>GetObjectTagging not implemented</Message>"
	);

	const putAcl = await s3Fetch("bucket/sub/x.txt?acl", {
		method: "PUT",
		body: "x",
	});
	expect(putAcl.status).toBe(501);
	expect(await putAcl.text()).toContain(
		"<Message>PutObjectAcl not implemented</Message>"
	);

	// DELETE ignores subresource parameters on R2 and just deletes the object
	const del = await s3Fetch("bucket/sub/x.txt?tagging", { method: "DELETE" });
	expect(del.status).toBe(204);
	expect(await r2.head("sub/x.txt")).toBe(null);
});

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

test("lists reject unknown search parameters like R2", async ({ expect }) => {
	const v1 = await s3Fetch("bucket?foobar=1");
	expect(v1.status).toBe(501);
	expect(await v1.text()).toContain(
		"<Message>ListObjectsV1 search parameter foobar not implemented</Message>"
	);

	const v2 = await s3Fetch("bucket?list-type=2&foobar=1");
	expect(v2.status).toBe(501);
	expect(await v2.text()).toContain(
		"<Message>ListObjectsV2 search parameter foobar not implemented</Message>"
	);

	const v3 = await s3Fetch("bucket?list-type=3");
	expect(v3.status).toBe(501);
	expect(await v3.text()).toContain(
		"<Message>ListObjectsV3 not implemented</Message>"
	);
});

test("HeadBucket and GetBucketLocation work", async ({ expect }) => {
	const client = s3();
	const head = await client.send(new HeadBucketCommand({ Bucket: "bucket" }));
	expect(head.$metadata.httpStatusCode).toBe(200);

	const location = await client.send(
		new GetBucketLocationCommand({ Bucket: "bucket" })
	);
	expect(location.LocationConstraint).toBe("auto");

	const extraParam = await s3Fetch("bucket?location&foobar=1");
	expect(extraParam.status).toBe(400);
	expect(await extraParam.text()).toContain(
		"<Message>Search param foobar is unsupported for bucket location</Message>"
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

test("static bucket-configuration reads match real R2", async ({ expect }) => {
	const client = s3();
	const encryption = await client.send(
		new GetBucketEncryptionCommand({ Bucket: "bucket" })
	);
	const rule = encryption.ServerSideEncryptionConfiguration?.Rules?.[0];
	expect(rule?.ApplyServerSideEncryptionByDefault?.SSEAlgorithm).toBe("AES256");
	expect(rule?.BucketKeyEnabled).toBe(true);

	// R2 has no bucket versioning; the configuration is always empty
	const versioning = await client.send(
		new GetBucketVersioningCommand({ Bucket: "bucket" })
	);
	expect(versioning.Status).toBeUndefined();

	const tagging = await s3Fetch("bucket?tagging");
	await expectError(tagging, 404, "NoSuchTagSet", expect);

	const objectLock = await s3Fetch("bucket?object-lock");
	await expectError(
		objectLock,
		404,
		"ObjectLockConfigurationNotFoundError",
		expect
	);

	const replication = await s3Fetch("bucket?replication");
	await expectError(
		replication,
		404,
		"ReplicationConfigurationNotFoundError",
		expect
	);

	// Stateful bucket configuration cannot be simulated locally
	const cors = await s3Fetch("bucket?cors");
	expect(cors.status).toBe(501);
	expect(await cors.text()).toContain("GetBucketCors not implemented");
});

test("ListBuckets lists buckets for the presented credentials", async ({
	expect,
}) => {
	const res = await s3().send(new ListBucketsCommand({}));
	expect(res.Buckets?.map((bucket) => bucket.Name)).toEqual([
		"bucket",
		"other-bucket",
	]);

	const third = await s3({ credentials: THIRD_CREDENTIALS }).send(
		new ListBucketsCommand({})
	);
	expect(third.Buckets?.map((bucket) => bucket.Name)).toEqual(["third-bucket"]);

	await expectSdkError(
		s3({
			credentials: { ...CREDENTIALS, secretAccessKey: "wrong" },
		}).send(new ListBucketsCommand({})),
		403,
		"SignatureDoesNotMatch",
		expect
	);

	const unknownParam = await s3Fetch("?foobar=1");
	expect(unknownParam.status).toBe(501);
	expect(await unknownParam.text()).toContain(
		"<Message>ListBuckets search parameter foobar not implemented</Message>"
	);

	// Only GET is routable at the account level
	const post = await s3Fetch("", { method: "POST" });
	await expectError(post, 404, "RouteNotFound", expect);
});

test("V1 lists reject continuation-token with R2's bespoke error", async ({
	expect,
}) => {
	const res = await s3Fetch("bucket?continuation-token=x");
	expect(res.status).toBe(400);
	expect(await res.text()).toContain(
		"<Message>continuation-token not supported in ListObjects</Message>"
	);
});

test("list edge cases match real R2", async ({ expect }) => {
	await seedListKeys();

	// max-keys=0 reports IsTruncated based on whether matching keys exist
	const zero = await s3Fetch("bucket?prefix=ls/&max-keys=0");
	const zeroText = await zero.text();
	expect(zeroText).toContain("<IsTruncated>true</IsTruncated>");
	expect(zeroText).toContain("<MaxKeys>0</MaxKeys>");
	expect(zeroText).not.toContain("<Contents>");

	// fractional values are floored
	const fractional = await s3Fetch("bucket?prefix=ls/&max-keys=1.5");
	expect(await fractional.text()).toContain("<MaxKeys>1</MaxKeys>");

	const emptyMaxKeys = await s3Fetch("bucket?max-keys=");
	await expectError(emptyMaxKeys, 400, "InvalidMaxKeys", expect);

	const nonFinite = await s3Fetch("bucket?max-keys=Infinity");
	await expectError(nonFinite, 400, "InvalidMaxKeys", expect);

	const invalid = await s3Fetch("bucket?max-keys=abc");
	expect(invalid.status).toBe(400);
	expect(await invalid.text()).toContain(
		"<Code>InvalidMaxKeys</Code><Message>MaxKeys params must be positive integer &lt;= 1000.</Message>"
	);

	const encoding = await s3Fetch("bucket?encoding-type=weird");
	expect(encoding.status).toBe(501);
	expect(await encoding.text()).toContain(
		"Unrecognized encoding-type &quot;weird&quot; not implemented"
	);
});

test("Complete with unknown uploadId returns NoSuchUpload", async ({
	expect,
}) => {
	await expectSdkError(
		s3().send(
			new CompleteMultipartUploadCommand({
				Bucket: "bucket",
				Key: "mp/nope.bin",
				UploadId: "bogus",
				MultipartUpload: {
					Parts: [
						{ PartNumber: 1, ETag: '"0123456789abcdef0123456789abcdef"' },
					],
				},
			})
		),
		404,
		"NoSuchUpload",
		expect
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
