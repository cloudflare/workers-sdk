import { Miniflare } from "miniflare";
import { assert, test } from "vitest";
import { miniflareTest, useDispose } from "../../test-shared";
import type { MiniflareTestContext } from "../../test-shared";
import type { R2Bucket } from "@cloudflare/workers-types/experimental";
import type { MiniflareOptions, ReplaceWorkersTypes } from "miniflare";

interface Context extends MiniflareTestContext {
	r2: ReplaceWorkersTypes<R2Bucket>;
}

const ctx = miniflareTest<{ BUCKET: R2Bucket }, Context>(
	{ r2Buckets: { BUCKET: "bucket" } },
	async (global) => new global.Response(null, { status: 404 })
);

function bucketUrl(path: string, base: URL): URL {
	return new URL(`/cdn-cgi/local/r2/public/bucket${path}`, base);
}

test("serves object body with metadata over HTTP", async ({ expect }) => {
	const r2 = await ctx.mf.getR2Bucket("BUCKET");
	await r2.put("public-key", "hello world", {
		httpMetadata: { contentType: "text/plain" },
	});
	const stored = await r2.head("public-key");
	assert(stored !== null);

	const res = await fetch(bucketUrl("/public-key", ctx.url));

	expect(res.status).toBe(200);
	expect(await res.text()).toBe("hello world");
	expect(res.headers.get("Content-Type")).toBe("text/plain");
	expect(res.headers.get("ETag")).toBe(stored.httpEtag);
	expect(res.headers.get("Last-Modified")).toBe(stored.uploaded.toUTCString());
});

test("a plain GET returns the full object as 200, not 206", async ({
	expect,
}) => {
	const r2 = await ctx.mf.getR2Bucket("BUCKET");
	await r2.put("full-key", "0123456789");

	const res = await fetch(bucketUrl("/full-key", ctx.url));

	expect(res.status).toBe(200);
	expect(await res.text()).toBe("0123456789");
	expect(res.headers.get("Content-Length")).toBe("10");
	expect(res.headers.get("Content-Range")).toBe(null);
	expect(res.headers.get("Accept-Ranges")).toBe("bytes");
});

test("forwards all stored HTTP metadata as response headers", async ({
	expect,
}) => {
	const r2 = await ctx.mf.getR2Bucket("BUCKET");
	await r2.put("metadata-key", "body", {
		httpMetadata: {
			contentType: "application/json",
			contentLanguage: "en-US",
			contentDisposition: 'attachment; filename="thing.json"',
			contentEncoding: "identity",
			cacheControl: "max-age=3600",
		},
	});

	const res = await fetch(bucketUrl("/metadata-key", ctx.url));

	expect(res.status).toBe(200);
	expect(await res.text()).toBe("body");
	expect(res.headers.get("Content-Type")).toBe("application/json");
	expect(res.headers.get("Content-Language")).toBe("en-US");
	expect(res.headers.get("Content-Disposition")).toBe(
		'attachment; filename="thing.json"'
	);
	expect(res.headers.get("Content-Encoding")).toBe("identity");
	expect(res.headers.get("Cache-Control")).toBe("max-age=3600");
});

test("returns 404 for a missing key", async ({ expect }) => {
	const res = await fetch(bucketUrl("/does-not-exist", ctx.url));
	expect(res.status).toBe(404);
});

test("returns 404 for the bucket root (empty key)", async ({ expect }) => {
	const res = await fetch(bucketUrl("/", ctx.url));
	expect(res.status).toBe(404);
});

test("returns 404 for an unknown bucket id", async ({ expect }) => {
	const res = await fetch(
		new URL("/cdn-cgi/local/r2/public/unknown/key", ctx.url)
	);
	expect(res.status).toBe(404);
});

test("decodes percent-encoded keys", async ({ expect }) => {
	const r2 = await ctx.mf.getR2Bucket("BUCKET");
	await r2.put("my folder/a file.txt", "nested");

	const res = await fetch(bucketUrl("/my%20folder/a%20file.txt", ctx.url));

	expect(res.status).toBe(200);
	expect(await res.text()).toBe("nested");
});

test("supports range requests", async ({ expect }) => {
	const r2 = await ctx.mf.getR2Bucket("BUCKET");
	await r2.put("range-key", "0123456789");

	const res = await fetch(bucketUrl("/range-key", ctx.url), {
		headers: { Range: "bytes=0-3" },
	});

	expect(res.status).toBe(206);
	expect(await res.text()).toBe("0123");
	expect(res.headers.get("Content-Range")).toBe("bytes 0-3/10");
	expect(res.headers.get("Content-Length")).toBe("4");
});

test("HEAD returns headers without a body", async ({ expect }) => {
	const r2 = await ctx.mf.getR2Bucket("BUCKET");
	await r2.put("head-key", "abcdef", {
		httpMetadata: { contentType: "text/plain" },
	});
	const stored = await r2.head("head-key");
	assert(stored !== null);

	const res = await fetch(bucketUrl("/head-key", ctx.url), { method: "HEAD" });

	expect(res.status).toBe(200);
	expect(res.headers.get("Content-Length")).toBe("6");
	expect(res.headers.get("Content-Type")).toBe("text/plain");
	expect(res.headers.get("ETag")).toBe(stored.httpEtag);
	expect(res.headers.get("Accept-Ranges")).toBe("bytes");
	expect(await res.text()).toBe("");
});

test("HEAD returns 404 for a missing key", async ({ expect }) => {
	const res = await fetch(bucketUrl("/missing-head", ctx.url), {
		method: "HEAD",
	});
	expect(res.status).toBe(404);
	await res.arrayBuffer();
});

test("rejects write methods with 405 and an Allow header", async ({
	expect,
}) => {
	const r2 = await ctx.mf.getR2Bucket("BUCKET");
	await r2.put("readonly-key", "untouched");

	for (const method of ["PUT", "POST", "DELETE"]) {
		const res = await fetch(bucketUrl("/readonly-key", ctx.url), {
			method,
			body: method === "DELETE" ? undefined : "tampered",
		});
		expect(res.status, `${method} should be rejected`).toBe(405);
		expect(res.headers.get("Allow")).toBe("GET, HEAD");
		await res.arrayBuffer();
	}

	const after = await r2.get("readonly-key");
	expect(await after?.text()).toBe("untouched");
});

test("returns 304 when If-None-Match matches", async ({ expect }) => {
	const r2 = await ctx.mf.getR2Bucket("BUCKET");
	await r2.put("conditional-key", "value");
	const stored = await r2.head("conditional-key");
	assert(stored !== null);

	const res = await fetch(bucketUrl("/conditional-key", ctx.url), {
		headers: { "If-None-Match": stored.httpEtag },
	});

	expect(res.status).toBe(304);
	expect(res.headers.get("ETag")).toBe(stored.httpEtag);
	expect(await res.text()).toBe("");
});

test("returns 200 when If-None-Match does not match", async ({ expect }) => {
	const r2 = await ctx.mf.getR2Bucket("BUCKET");
	await r2.put("inm-miss-key", "fresh");

	const res = await fetch(bucketUrl("/inm-miss-key", ctx.url), {
		headers: { "If-None-Match": '"some-other-etag"' },
	});

	expect(res.status).toBe(200);
	expect(await res.text()).toBe("fresh");
});

test("returns 412 when If-Match does not match", async ({ expect }) => {
	const r2 = await ctx.mf.getR2Bucket("BUCKET");
	await r2.put("if-match-key", "value");

	const res = await fetch(bucketUrl("/if-match-key", ctx.url), {
		headers: { "If-Match": '"definitely-not-the-etag"' },
	});

	expect(res.status).toBe(412);
	expect(await res.text()).toBe("");
});

test("returns 200 when If-Match matches", async ({ expect }) => {
	const r2 = await ctx.mf.getR2Bucket("BUCKET");
	await r2.put("if-match-hit-key", "value");
	const stored = await r2.head("if-match-hit-key");
	assert(stored !== null);

	const res = await fetch(bucketUrl("/if-match-hit-key", ctx.url), {
		headers: { "If-Match": stored.httpEtag },
	});

	expect(res.status).toBe(200);
	expect(await res.text()).toBe("value");
});

test("returns 304 when If-Modified-Since is after the upload time", async ({
	expect,
}) => {
	const r2 = await ctx.mf.getR2Bucket("BUCKET");
	await r2.put("ims-key", "value");

	const future = new Date(Date.now() + 60_000).toUTCString();
	const res = await fetch(bucketUrl("/ims-key", ctx.url), {
		headers: { "If-Modified-Since": future },
	});

	expect(res.status).toBe(304);
	expect(await res.text()).toBe("");
});

test("returns 200 when If-Modified-Since is before the upload time", async ({
	expect,
}) => {
	const r2 = await ctx.mf.getR2Bucket("BUCKET");
	await r2.put("ims-hit-key", "fresh");

	const past = new Date(Date.now() - 60_000).toUTCString();
	const res = await fetch(bucketUrl("/ims-hit-key", ctx.url), {
		headers: { "If-Modified-Since": past },
	});

	expect(res.status).toBe(200);
	expect(await res.text()).toBe("fresh");
});

test("returns 412 when If-Unmodified-Since is before the upload time", async ({
	expect,
}) => {
	const r2 = await ctx.mf.getR2Bucket("BUCKET");
	await r2.put("ius-key", "value");

	const past = new Date(Date.now() - 60_000).toUTCString();
	const res = await fetch(bucketUrl("/ius-key", ctx.url), {
		headers: { "If-Unmodified-Since": past },
	});

	expect(res.status).toBe(412);
	expect(await res.text()).toBe("");
});

test("reports 412 over 304 when both header families fail", async ({
	expect,
}) => {
	const r2 = await ctx.mf.getR2Bucket("BUCKET");
	await r2.put("both-key", "value");
	const stored = await r2.head("both-key");
	assert(stored !== null);

	const res = await fetch(bucketUrl("/both-key", ctx.url), {
		headers: {
			"If-Match": '"definitely-not-the-etag"',
			"If-None-Match": stored.httpEtag,
		},
	});

	expect(res.status).toBe(412);
	expect(await res.text()).toBe("");
});

test("multiple buckets are each independently reachable", async ({
	expect,
}) => {
	const opts: MiniflareOptions = {
		modules: true,
		script:
			"export default { fetch() { return new Response(null, { status: 404 }) } }",
		r2Buckets: { ALPHA: "alpha", BETA: "beta" },
	};
	const mf = new Miniflare(opts);
	useDispose(mf);

	const url = await mf.ready;
	const alpha = await mf.getR2Bucket("ALPHA");
	const beta = await mf.getR2Bucket("BETA");
	await alpha.put("k", "alpha-body");
	await beta.put("k", "beta-body");

	const alphaRes = await fetch(
		new URL("/cdn-cgi/local/r2/public/alpha/k", url)
	);
	expect(alphaRes.status).toBe(200);
	expect(await alphaRes.text()).toBe("alpha-body");

	const betaRes = await fetch(new URL("/cdn-cgi/local/r2/public/beta/k", url));
	expect(betaRes.status).toBe(200);
	expect(await betaRes.text()).toBe("beta-body");
});

test("buckets across multiple workers are all reachable", async ({
	expect,
}) => {
	const opts: MiniflareOptions = {
		workers: [
			{
				name: "worker-a",
				modules: true,
				script:
					"export default { fetch() { return new Response(null, { status: 404 }) } }",
				r2Buckets: { BUCKET: "alpha" },
			},
			{
				name: "worker-b",
				modules: true,
				script:
					"export default { fetch() { return new Response(null, { status: 404 }) } }",
				r2Buckets: { BUCKET: "beta" },
			},
		],
	};
	const mf = new Miniflare(opts);
	useDispose(mf);

	const url = await mf.ready;
	const alpha = await mf.getR2Bucket("BUCKET", "worker-a");
	const beta = await mf.getR2Bucket("BUCKET", "worker-b");
	await alpha.put("k", "alpha-body");
	await beta.put("k", "beta-body");

	const alphaRes = await fetch(
		new URL("/cdn-cgi/local/r2/public/alpha/k", url)
	);
	expect(alphaRes.status).toBe(200);
	expect(await alphaRes.text()).toBe("alpha-body");

	const betaRes = await fetch(new URL("/cdn-cgi/local/r2/public/beta/k", url));
	expect(betaRes.status).toBe(200);
	expect(await betaRes.text()).toBe("beta-body");
});

test("two bindings pointing at the same underlying bucket id share the same URL", async ({
	expect,
}) => {
	const opts: MiniflareOptions = {
		modules: true,
		script:
			"export default { fetch() { return new Response(null, { status: 404 }) } }",
		r2Buckets: { ALIAS_A: "shared", ALIAS_B: "shared" },
	};
	const mf = new Miniflare(opts);
	useDispose(mf);

	const url = await mf.ready;
	const a = await mf.getR2Bucket("ALIAS_A");
	await a.put("k", "shared-body");

	const res = await fetch(new URL("/cdn-cgi/local/r2/public/shared/k", url));
	expect(res.status).toBe(200);
	expect(await res.text()).toBe("shared-body");
});
