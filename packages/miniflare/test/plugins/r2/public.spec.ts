import { Miniflare } from "miniflare";
import { assert, describe, test } from "vitest";
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

test("defaults Content-Type to application/octet-stream when unset", async ({
	expect,
}) => {
	const r2 = await ctx.mf.getR2Bucket("BUCKET");
	await r2.put("no-type-key", "0123456789");

	const res = await fetch(bucketUrl("/no-type-key", ctx.url));

	expect(res.status).toBe(200);
	expect(await res.text()).toBe("0123456789");
	expect(res.headers.get("Content-Type")).toBe("application/octet-stream");
	expect(res.headers.get("Content-Length")).toBe("10");
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

	// Keys containing `%` must be decoded exactly once
	await r2.put("100%/a%2Bb.txt", "percent");
	const percent = await fetch(bucketUrl("/100%25/a%252Bb.txt", ctx.url));
	expect(percent.status).toBe(200);
	expect(await percent.text()).toBe("percent");
});

test("GET supports range requests", async ({ expect }) => {
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

test("GET honors suffix ranges with a partial 206", async ({ expect }) => {
	const r2 = await ctx.mf.getR2Bucket("BUCKET");
	await r2.put("suffix-range-key", "0123456789");

	const res = await fetch(bucketUrl("/suffix-range-key", ctx.url), {
		headers: { Range: "bytes=-4" },
	});

	expect(res.status).toBe(206);
	expect(await res.text()).toBe("6789");
	expect(res.headers.get("Content-Range")).toBe("bytes 6-9/10");
	expect(res.headers.get("Content-Length")).toBe("4");
});

test("HEAD honors Range with a bodyless 206", async ({ expect }) => {
	const r2 = await ctx.mf.getR2Bucket("BUCKET");
	await r2.put("head-range-key", "0123456789");

	const res = await fetch(bucketUrl("/head-range-key", ctx.url), {
		method: "HEAD",
		headers: { Range: "bytes=0-3" },
	});

	expect(res.status).toBe(206);
	expect(res.headers.get("Content-Range")).toBe("bytes 0-3/10");
	expect(res.headers.get("Content-Length")).toBe("4");
	expect(await res.text()).toBe("");
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

test("rejects write methods with 401", async ({ expect }) => {
	const r2 = await ctx.mf.getR2Bucket("BUCKET");
	await r2.put("readonly-key", "untouched");

	for (const method of ["PUT", "POST", "DELETE"]) {
		const res = await fetch(bucketUrl("/readonly-key", ctx.url), {
			method,
			body: method === "DELETE" ? undefined : "tampered",
		});
		expect(res.status, `${method} should be rejected`).toBe(401);
		await res.arrayBuffer();
	}

	const after = await r2.get("readonly-key");
	expect(await after?.text()).toBe("untouched");
});

test("rejects malformed and multiple ranges with 400", async ({ expect }) => {
	const r2 = await ctx.mf.getR2Bucket("BUCKET");
	await r2.put("bad-range-key", "0123456789");

	for (const range of ["bytes=zzz", "bytes=0-1,3-4", "0-3", "bytes=5-2"]) {
		const res = await fetch(bucketUrl("/bad-range-key", ctx.url), {
			headers: { Range: range },
		});
		expect(res.status, `"${range}" should be rejected`).toBe(400);
		await res.arrayBuffer();
	}
});

test("rejects unsatisfiable ranges with 416", async ({ expect }) => {
	const r2 = await ctx.mf.getR2Bucket("BUCKET");
	await r2.put("unsat-range-key", "0123456789");

	const res = await fetch(bucketUrl("/unsat-range-key", ctx.url), {
		headers: { Range: "bytes=99999-" },
	});
	expect(res.status).toBe(416);
	await res.arrayBuffer();

	// A zero suffix length is unsatisfiable for any object
	const zeroSuffix = await fetch(bucketUrl("/unsat-range-key", ctx.url), {
		headers: { Range: "bytes=-0" },
	});
	expect(zeroSuffix.status).toBe(416);
	await zeroSuffix.arrayBuffer();

	// Any range on a zero-length object is unsatisfiable, including a suffix
	// range (which the simulator would otherwise serve as a zero-length 206)
	await r2.put("empty-range-key", "");
	const emptySuffix = await fetch(bucketUrl("/empty-range-key", ctx.url), {
		headers: { Range: "bytes=-5" },
	});
	expect(emptySuffix.status).toBe(416);
	await emptySuffix.arrayBuffer();
});

// The entry worker rejects /cdn-cgi/* requests from non-localhost origins
// before they reach this worker, so cross-origin here means a different
// localhost port (e.g. a frontend dev server).
test("answers CORS preflight requests", async ({ expect }) => {
	const res = await fetch(bucketUrl("/any-key", ctx.url), {
		method: "OPTIONS",
		headers: {
			Origin: "http://localhost:3000",
			"Access-Control-Request-Method": "GET",
			"Access-Control-Request-Headers": "If-None-Match",
		},
	});

	expect(res.status).toBe(204);
	expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
	expect(res.headers.get("Access-Control-Allow-Methods")).toBe("GET,HEAD");
	expect(res.headers.get("Access-Control-Allow-Headers")).toBe("If-None-Match");
});

test("sets allow-all CORS headers on cross-origin GET responses", async ({
	expect,
}) => {
	const r2 = await ctx.mf.getR2Bucket("BUCKET");
	await r2.put("cors-key", "cors-body");

	const res = await fetch(bucketUrl("/cors-key", ctx.url), {
		headers: { Origin: "http://localhost:3000" },
	});

	expect(res.status).toBe(200);
	expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
	expect(res.headers.get("Access-Control-Expose-Headers")).toBe("*");
	expect(await res.text()).toBe("cors-body");
});

// Conditional requests behave identically for GET and HEAD, except that
// HEAD success responses have no body.
describe.each(["GET", "HEAD"] as const)("%s conditional requests", (method) => {
	function expectedBody(body: string): string {
		return method === "GET" ? body : "";
	}

	test("returns 304 when If-None-Match matches", async ({ expect }) => {
		const r2 = await ctx.mf.getR2Bucket("BUCKET");
		const key = `${method}-inm-hit-key`;
		await r2.put(key, "value");
		const stored = await r2.head(key);
		assert(stored !== null);

		const res = await fetch(bucketUrl(`/${key}`, ctx.url), {
			method,
			headers: { "If-None-Match": stored.httpEtag },
		});

		expect(res.status).toBe(304);
		expect(res.headers.get("ETag")).toBe(stored.httpEtag);
		expect(await res.text()).toBe("");
	});

	test("returns 200 when If-None-Match does not match", async ({ expect }) => {
		const r2 = await ctx.mf.getR2Bucket("BUCKET");
		const key = `${method}-inm-miss-key`;
		await r2.put(key, "fresh");

		const res = await fetch(bucketUrl(`/${key}`, ctx.url), {
			method,
			headers: { "If-None-Match": '"some-other-etag"' },
		});

		expect(res.status).toBe(200);
		expect(res.headers.get("Content-Length")).toBe("5");
		expect(await res.text()).toBe(expectedBody("fresh"));
	});

	test("returns 412 when If-Match does not match", async ({ expect }) => {
		const r2 = await ctx.mf.getR2Bucket("BUCKET");
		const key = `${method}-if-match-miss-key`;
		await r2.put(key, "value");

		const res = await fetch(bucketUrl(`/${key}`, ctx.url), {
			method,
			headers: { "If-Match": '"definitely-not-the-etag"' },
		});

		expect(res.status).toBe(412);
		expect(await res.text()).toBe("");
	});

	test("returns 200 when If-Match matches", async ({ expect }) => {
		const r2 = await ctx.mf.getR2Bucket("BUCKET");
		const key = `${method}-if-match-hit-key`;
		await r2.put(key, "value");
		const stored = await r2.head(key);
		assert(stored !== null);

		const res = await fetch(bucketUrl(`/${key}`, ctx.url), {
			method,
			headers: { "If-Match": stored.httpEtag },
		});

		expect(res.status).toBe(200);
		expect(res.headers.get("Content-Length")).toBe("5");
		expect(await res.text()).toBe(expectedBody("value"));
	});

	test("returns 304 when If-Modified-Since is after the upload time", async ({
		expect,
	}) => {
		const r2 = await ctx.mf.getR2Bucket("BUCKET");
		const key = `${method}-ims-miss-key`;
		await r2.put(key, "value");

		const future = new Date(Date.now() + 60_000).toUTCString();
		const res = await fetch(bucketUrl(`/${key}`, ctx.url), {
			method,
			headers: { "If-Modified-Since": future },
		});

		expect(res.status).toBe(304);
		expect(await res.text()).toBe("");
	});

	test("returns 200 when If-Modified-Since is before the upload time", async ({
		expect,
	}) => {
		const r2 = await ctx.mf.getR2Bucket("BUCKET");
		const key = `${method}-ims-hit-key`;
		await r2.put(key, "fresh");

		const past = new Date(Date.now() - 60_000).toUTCString();
		const res = await fetch(bucketUrl(`/${key}`, ctx.url), {
			method,
			headers: { "If-Modified-Since": past },
		});

		expect(res.status).toBe(200);
		expect(await res.text()).toBe(expectedBody("fresh"));
	});

	test("returns 412 when If-Unmodified-Since is before the upload time", async ({
		expect,
	}) => {
		const r2 = await ctx.mf.getR2Bucket("BUCKET");
		const key = `${method}-ius-miss-key`;
		await r2.put(key, "value");

		const past = new Date(Date.now() - 60_000).toUTCString();
		const res = await fetch(bucketUrl(`/${key}`, ctx.url), {
			method,
			headers: { "If-Unmodified-Since": past },
		});

		expect(res.status).toBe(412);
		expect(await res.text()).toBe("");
	});

	test("reports 412 over 304 when both header families fail", async ({
		expect,
	}) => {
		const r2 = await ctx.mf.getR2Bucket("BUCKET");
		const key = `${method}-both-key`;
		await r2.put(key, "value");
		const stored = await r2.head(key);
		assert(stored !== null);

		const res = await fetch(bucketUrl(`/${key}`, ctx.url), {
			method,
			headers: {
				"If-Match": '"definitely-not-the-etag"',
				"If-None-Match": stored.httpEtag,
			},
		});

		expect(res.status).toBe(412);
		expect(await res.text()).toBe("");
	});

	test("returns 304 when If-Match passes but If-None-Match fails", async ({
		expect,
	}) => {
		const r2 = await ctx.mf.getR2Bucket("BUCKET");
		const key = `${method}-im-pass-inm-fail-key`;
		await r2.put(key, "value");
		const stored = await r2.head(key);
		assert(stored !== null);

		const res = await fetch(bucketUrl(`/${key}`, ctx.url), {
			method,
			headers: {
				"If-Match": stored.httpEtag,
				"If-None-Match": stored.httpEtag,
			},
		});

		expect(res.status).toBe(304);
		expect(res.headers.get("ETag")).toBe(stored.httpEtag);
		expect(await res.text()).toBe("");
	});

	test("returns 304 when If-Unmodified-Since passes but If-None-Match fails", async ({
		expect,
	}) => {
		const r2 = await ctx.mf.getR2Bucket("BUCKET");
		const key = `${method}-ius-pass-inm-fail-key`;
		await r2.put(key, "value");
		const stored = await r2.head(key);
		assert(stored !== null);

		const future = new Date(Date.now() + 60_000).toUTCString();
		const res = await fetch(bucketUrl(`/${key}`, ctx.url), {
			method,
			headers: {
				"If-Unmodified-Since": future,
				"If-None-Match": stored.httpEtag,
			},
		});

		expect(res.status).toBe(304);
		expect(await res.text()).toBe("");
	});

	test("ignores failing If-Unmodified-Since when If-Match passes", async ({
		expect,
	}) => {
		const r2 = await ctx.mf.getR2Bucket("BUCKET");
		const key = `${method}-im-overrides-ius-key`;
		await r2.put(key, "value");
		const stored = await r2.head(key);
		assert(stored !== null);

		const past = new Date(Date.now() - 60_000).toUTCString();
		const res = await fetch(bucketUrl(`/${key}`, ctx.url), {
			method,
			headers: {
				"If-Match": stored.httpEtag,
				"If-Unmodified-Since": past,
			},
		});

		expect(res.status).toBe(200);
		expect(await res.text()).toBe(expectedBody("value"));
	});

	test("returns 200 when If-Unmodified-Since is after the upload time", async ({
		expect,
	}) => {
		const r2 = await ctx.mf.getR2Bucket("BUCKET");
		const key = `${method}-ius-hit-key`;
		await r2.put(key, "value");

		const future = new Date(Date.now() + 60_000).toUTCString();
		const res = await fetch(bucketUrl(`/${key}`, ctx.url), {
			method,
			headers: { "If-Unmodified-Since": future },
		});

		expect(res.status).toBe(200);
		expect(await res.text()).toBe(expectedBody("value"));
	});

	test("ignores failing If-Modified-Since when If-None-Match passes", async ({
		expect,
	}) => {
		const r2 = await ctx.mf.getR2Bucket("BUCKET");
		const key = `${method}-inm-overrides-ims-key`;
		await r2.put(key, "value");

		const future = new Date(Date.now() + 60_000).toUTCString();
		const res = await fetch(bucketUrl(`/${key}`, ctx.url), {
			method,
			headers: {
				"If-None-Match": '"some-other-etag"',
				"If-Modified-Since": future,
			},
		});

		expect(res.status).toBe(200);
		expect(await res.text()).toBe(expectedBody("value"));
	});

	test("returns 304 when If-Match passes but If-Modified-Since fails", async ({
		expect,
	}) => {
		const r2 = await ctx.mf.getR2Bucket("BUCKET");
		const key = `${method}-im-pass-ims-fail-key`;
		await r2.put(key, "value");
		const stored = await r2.head(key);
		assert(stored !== null);

		const future = new Date(Date.now() + 60_000).toUTCString();
		const res = await fetch(bucketUrl(`/${key}`, ctx.url), {
			method,
			headers: {
				"If-Match": stored.httpEtag,
				"If-Modified-Since": future,
			},
		});

		expect(res.status).toBe(304);
		expect(await res.text()).toBe("");
	});

	test("reports 412 over 304 when If-Unmodified-Since and If-None-Match both fail", async ({
		expect,
	}) => {
		const r2 = await ctx.mf.getR2Bucket("BUCKET");
		const key = `${method}-ius-inm-both-fail-key`;
		await r2.put(key, "value");
		const stored = await r2.head(key);
		assert(stored !== null);

		const past = new Date(Date.now() - 60_000).toUTCString();
		const res = await fetch(bucketUrl(`/${key}`, ctx.url), {
			method,
			headers: {
				"If-Unmodified-Since": past,
				"If-None-Match": stored.httpEtag,
			},
		});

		expect(res.status).toBe(412);
		expect(await res.text()).toBe("");
	});

	test("returns 404 for a missing key regardless of conditional headers", async ({
		expect,
	}) => {
		const res = await fetch(bucketUrl(`/${method}-missing-key`, ctx.url), {
			method,
			headers: {
				"If-Match": '"some-etag"',
				"If-None-Match": '"some-etag"',
			},
		});

		expect(res.status).toBe(404);
	});
});

test("a failed conditional with a Range returns 304 without a partial body", async ({
	expect,
}) => {
	const r2 = await ctx.mf.getR2Bucket("BUCKET");
	await r2.put("range-conditional-key", "0123456789");
	const stored = await r2.head("range-conditional-key");
	assert(stored !== null);

	const res = await fetch(bucketUrl("/range-conditional-key", ctx.url), {
		headers: {
			Range: "bytes=0-3",
			"If-None-Match": stored.httpEtag,
		},
	});

	expect(res.status).toBe(304);
	expect(res.headers.get("Content-Range")).toBeNull();
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
