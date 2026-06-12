import { Sha256 } from "@aws-crypto/sha256-js";
import {
	GetObjectCommand,
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
