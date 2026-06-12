import { Sha256 } from "@aws-crypto/sha256-js";
import { SignatureV4 } from "@smithy/signature-v4";
import { Miniflare } from "miniflare";
import { test } from "vitest";
import { miniflareTest } from "../../test-shared";
import type { MiniflareTestContext } from "../../test-shared";
import type { R2Bucket } from "@cloudflare/workers-types/experimental";

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

test("rejects anonymous requests", async ({ expect }) => {
	const res = await fetch(s3Url("bucket/key.txt"));
	expect(res.status).toBe(400);
	expect(await res.text()).toContain(
		"<Code>InvalidArgument</Code><Message>Authorization</Message>"
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
