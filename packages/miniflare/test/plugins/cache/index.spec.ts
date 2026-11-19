import assert from "node:assert";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { setTimeout } from "node:timers/promises";
import { CACHE_PLUGIN_NAME, Miniflare, Request, Response } from "miniflare";
import { beforeEach, type ExpectStatic, onTestFinished, test } from "vitest";
import {
	miniflareTest,
	singleModuleManifest,
	useDispose,
	useTmp,
} from "../../test-shared";
import type { MiniflareTestContext } from "../../test-shared";
import type { CacheStorage } from "@cloudflare/workers-types/experimental";
import type {
	HeadersInit,
	MiniflareOptions,
	ReplaceWorkersTypes,
	RequestInit,
} from "miniflare";

interface Context extends MiniflareTestContext {
	caches: ReplaceWorkersTypes<CacheStorage>;
}

const ctx = miniflareTest<never, Context>({}, async (global, req) => {
	const { pathname } = new global.URL(req.url);
	// The API proxy doesn't support putting buffered bodies, so register a
	// special endpoint for testing
	if (pathname === "/put-buffered") {
		const resToCache = new global.Response("buffered", {
			headers: { "Cache-Control": "max-age=3600" },
		});
		await global.caches.default.put("http://localhost/cache-hit", resToCache);
		return new global.Response(null, { status: 204 });
	}
	return new global.Response(null, { status: 404 });
});

beforeEach(async () => {
	ctx.caches = await ctx.mf.getCaches();
});

test("match returns cached responses", async ({ expect }) => {
	const cache = ctx.caches.default;
	const key = "http://localhost/cache-hit";

	// Check caching stream body
	let resToCache = new Response("body", {
		headers: { "Cache-Control": "max-age=3600", "X-Key": "value" },
	});
	await cache.put(key, resToCache);
	let res = await cache.match(key);
	assert(res !== undefined);
	expect(res.status).toBe(200);
	expect(res.headers.get("Cache-Control")).toBe("max-age=3600");
	expect(res.headers.get("CF-Cache-Status")).toBe("HIT");
	expect(res.headers.get("X-Key")).toBe("value"); // Check custom headers stored
	expect(await res.text()).toBe("body");

	// Check caching binary streamed body
	const array = new Uint8Array([1, 2, 3]);
	resToCache = new Response(array, {
		headers: { "Cache-Control": "max-age=3600" },
	});
	await cache.put(key, resToCache);
	res = await cache.match(key);
	assert(res !== undefined);
	expect(res.status).toBe(200);
	expect(new Uint8Array(await res.arrayBuffer())).toEqual(array);

	// Check caching buffered body
	await ctx.mf.dispatchFetch("http://localhost/put-buffered", {
		method: "PUT",
	});
	res = await cache.match(key);
	assert(res !== undefined);
	expect(res.status).toBe(200);
	expect(await res.text()).toBe("buffered");
});
test("match returns empty response", async ({ expect }) => {
	const cache = ctx.caches.default;
	const key = "http://localhost/cache-empty";
	const resToCache = new Response(null, {
		headers: { "Cache-Control": "max-age=3600" },
	});
	await cache.put(key, resToCache);
	const res = await cache.match(key);
	assert(res !== undefined);
	expect(res.status).toBe(200);
	expect(await res.text()).toBe("");
});
test("match returns nothing on cache miss", async ({ expect }) => {
	const cache = ctx.caches.default;
	const key = "http://localhost/cache-miss";
	const res = await cache.match(key);
	expect(res).toBeUndefined();
});
test("match respects If-None-Match header", async ({ expect }) => {
	const cache = ctx.caches.default;
	const key = "http://localhost/cache-if-none-match";
	const resToCache = new Response("body", {
		headers: { ETag: '"thing"', "Cache-Control": "max-age=3600" },
	});
	await cache.put(key, resToCache);

	const ifNoneMatch = (value: string) =>
		cache.match(new Request(key, { headers: { "If-None-Match": value } }));

	// Check returns 304 only if an ETag in `If-Modified-Since` matches
	let res = await ifNoneMatch('"thing"');
	expect(res?.status).toBe(304);
	res = await ifNoneMatch('   W/"thing"      ');
	expect(res?.status).toBe(304);
	res = await ifNoneMatch('"not the thing"');
	expect(res?.status).toBe(200);
	res = await ifNoneMatch(
		'"not the thing",    "thing"    , W/"still not the thing"'
	);
	expect(res?.status).toBe(304);
	res = await ifNoneMatch("*");
	expect(res?.status).toBe(304);
	res = await ifNoneMatch("    *   ");
	expect(res?.status).toBe(304);
});
test("match respects If-Modified-Since header", async ({ expect }) => {
	const cache = ctx.caches.default;
	const key = "http://localhost/cache-if-modified-since";
	const resToCache = new Response("body", {
		headers: {
			"Last-Modified": "Tue, 13 Sep 2022 12:00:00 GMT",
			"Cache-Control": "max-age=3600",
		},
	});
	await cache.put(key, resToCache);

	const ifModifiedSince = (value: string) =>
		cache.match(new Request(key, { headers: { "If-Modified-Since": value } }));

	// Check returns 200 if modified after `If-Modified-Since`
	let res = await ifModifiedSince("Tue, 13 Sep 2022 11:00:00 GMT");
	expect(res?.status).toBe(200);
	// Check returns 304 if modified on `If-Modified-Since`
	res = await ifModifiedSince("Tue, 13 Sep 2022 12:00:00 GMT");
	expect(res?.status).toBe(304);
	// Check returns 304 if modified before `If-Modified-Since`
	res = await ifModifiedSince("Tue, 13 Sep 2022 13:00:00 GMT");
	expect(res?.status).toBe(304);
	// Check returns 200 if `If-Modified-Since` is not a "valid" UTC date
	res = await ifModifiedSince("13 Sep 2022 13:00:00 GMT");
	expect(res?.status).toBe(200);
});
test("match respects Range header", async ({ expect }) => {
	const cache = ctx.caches.default;
	const key = "http://localhost/cache-range";
	const resToCache = new Response("0123456789", {
		headers: {
			"Content-Length": "10",
			"Content-Type": "text/plain",
			"Cache-Control": "max-age=3600",
		},
	});
	await cache.put(key, resToCache);

	// Check with single range
	let res = await cache.match(
		new Request(key, { headers: { Range: "bytes=2-4" } })
	);
	assert(res !== undefined);
	expect(res.status).toBe(206);
	expect(res.headers.get("Content-Length")).toBe("3");
	expect(res.headers.get("Cache-Control")).toBe("max-age=3600");
	expect(res.headers.get("CF-Cache-Status")).toBe("HIT");
	expect(await res.text()).toBe("234");

	// Check with multiple ranges
	res = await cache.match(
		new Request(key, { headers: { Range: "bytes=1-3,5-6" } })
	);
	assert(res !== undefined);
	expect(res.status).toBe(206);
	expect(res.headers.get("Cache-Control")).toBe("max-age=3600");
	expect(res.headers.get("CF-Cache-Status")).toBe("HIT");
	const contentType = res.headers.get("Content-Type");
	assert(contentType !== null);
	const [brand, boundary] = contentType.split("=");
	expect(brand).toBe("multipart/byteranges; boundary");
	expect(await res.text()).toBe(
		[
			`--${boundary}`,
			"Content-Type: text/plain",
			"Content-Range: bytes 1-3/10",
			"",
			"123",
			`--${boundary}`,
			"Content-Type: text/plain",
			"Content-Range: bytes 5-6/10",
			"",
			"56",
			`--${boundary}--`,
		].join("\r\n")
	);

	// Check with unsatisfiable range
	res = await cache.match(
		new Request(key, { headers: { Range: "bytes=15-" } })
	);
	assert(res !== undefined);
	expect(res.status).toBe(416);
});
test("put overrides existing responses", async ({ expect }) => {
	const cache = ctx.caches.default;
	const resToCache = (body: string) =>
		new Response(body, { headers: { "Cache-Control": "max-age=3600" } });

	const key = "http://localhost/cache-override";
	await cache.put(key, resToCache("body1"));
	await cache.put(key, resToCache("body2"));
	const res = await cache.match(key);
	expect(await res?.text()).toBe("body2");
});

// The cache runs on workerd's clock, so these wait for entries to expire.
async function testExpire(
	expect: ExpectStatic,
	opts: { key: string; headers: HeadersInit; expires: number }
) {
	const cache = ctx.caches.default;
	await cache.put(opts.key, new Response("body", { headers: opts.headers }));
	expect((await cache.match(opts.key))?.status).toBe(200);
	await setTimeout(opts.expires - Date.now() + 250);
	expect(await cache.match(opts.key)).toBeUndefined();
}
test("expires after Expires", async ({ expect }) => {
	// HTTP dates have whole seconds
	const expires = Math.ceil(Date.now() / 1000) * 1000 + 1000;
	await testExpire(expect, {
		key: "http://localhost/cache-expire-expires",
		headers: { Expires: new Date(expires).toUTCString() },
		expires,
	});
});
test("expires after Cache-Control's max-age", async ({ expect }) => {
	await testExpire(expect, {
		key: "http://localhost/cache-expire-max-age",
		headers: { "Cache-Control": "max-age=1" },
		expires: Date.now() + 1000,
	});
});
test("expires after Cache-Control's s-maxage", async ({ expect }) => {
	await testExpire(expect, {
		key: "http://localhost/cache-expire-s-maxage",
		headers: { "Cache-Control": "s-maxage=1, max-age=10" },
		expires: Date.now() + 1000,
	});
});

async function testIsCached(
	expect: ExpectStatic,
	opts: {
		headers: Record<string, string>;
		cached: boolean;
	}
) {
	const cache = ctx.caches.default;

	// Use different key for each invocation of this helper
	const headersHash = crypto
		.createHash("sha1")
		.update(JSON.stringify(opts.headers))
		.digest("hex");
	const key = `http://localhost/cache-is-cached-${headersHash}`;

	const expires = new Date(Date.now() + 3_600_000).toUTCString();
	const resToCache = new Response("body", {
		headers: { ...opts.headers, Expires: expires },
	});
	await cache.put(key, resToCache);
	const res = await cache.match(key);
	expect(res?.status).toBe(opts.cached ? 200 : undefined);
}
test("put does not cache with private Cache-Control", async ({ expect }) => {
	await testIsCached(expect, {
		headers: { "Cache-Control": "private" },
		cached: false,
	});
});
test("put does not cache with no-store Cache-Control", async ({ expect }) => {
	await testIsCached(expect, {
		headers: { "Cache-Control": "no-store" },
		cached: false,
	});
});
test("put does not cache with no-cache Cache-Control", async ({ expect }) => {
	await testIsCached(expect, {
		headers: { "Cache-Control": "no-cache" },
		cached: false,
	});
});
test("put does not cache with Set-Cookie", async ({ expect }) => {
	await testIsCached(expect, {
		headers: { "Set-Cookie": "key=value" },
		cached: false,
	});
});
test("put caches with Set-Cookie if Cache-Control private=set-cookie", async ({
	expect,
}) => {
	await testIsCached(expect, {
		headers: {
			"Cache-Control": "private=set-cookie",
			"Set-Cookie": "key=value",
		},
		cached: true,
	});
});

test("delete returns if deleted", async ({ expect }) => {
	const cache = ctx.caches.default;
	const key = "http://localhost/cache-delete";
	const resToCache = new Response("body", {
		headers: { "Cache-Control": "max-age=3600" },
	});
	await cache.put(key, resToCache);

	// Check first delete deletes
	let deleted = await cache.delete(key);
	expect(deleted).toBe(true);

	// Check subsequent deletes don't match
	deleted = await cache.delete(key);
	expect(deleted).toBe(false);
});

test("operations respect cf.cacheKey", async ({ expect }) => {
	const cache = ctx.caches.default;
	const key = "http://localhost/cache-cf-key-unused";

	// Check put respects `cf.cacheKey`
	const key1 = new Request(key, { cf: { cacheKey: "1" } });
	const key2 = new Request(key, { cf: { cacheKey: "2" } });
	const resToCache1 = new Response("body1", {
		headers: { "Cache-Control": "max-age=3600" },
	});
	const resToCache2 = new Response("body2", {
		headers: { "Cache-Control": "max-age=3600" },
	});
	await cache.put(key1, resToCache1);
	await cache.put(key2, resToCache2);

	// Check match respects `cf.cacheKey`
	const res1 = await cache.match(key1);
	expect(await res1?.text()).toBe("body1");
	const res2 = await cache.match(key2);
	expect(await res2?.text()).toBe("body2");

	// Check delete respects `cf.cacheKey`
	const deleted1 = await cache.delete(key1);
	expect(deleted1).toBe(true);
	const deleted2 = await cache.delete(key2);
	expect(deleted2).toBe(true);
});
test("operations persist cached data", async ({ expect }) => {
	// Create new temporary file-system persistence directory
	const tmp = await useTmp();
	const opts: MiniflareOptions = {
		resourcePersistencePath: tmp,
		workers: [
			{
				config: {
					name: "",
					compatibilityDate: "2025-05-01",
					manifest: singleModuleManifest(""),
				},
			},
		],
	};
	let mf = new Miniflare(opts);
	useDispose(mf);

	let cache = (await mf.getCaches()).default;
	const key = "http://localhost/cache-persist";

	// Check put respects persist
	const resToCache = new Response("body", {
		headers: { "Cache-Control": "max-age=3600" },
	});
	await cache.put(key, resToCache);

	// Check the entry is a file in the default cache's directory under the
	// plugin subdirectory
	const names = await fs.readdir(path.join(tmp, CACHE_PLUGIN_NAME, "default"));
	expect(names.some((name) => /^[0-9a-f]{64}$/.test(name))).toBe(true);

	// Check "restarting" keeps persisted data
	await mf.dispose();
	mf = new Miniflare(opts);
	useDispose(mf);
	cache = (await mf.getCaches()).default;

	// Check match respects persist
	const res = await cache.match(key);
	expect(res?.status).toBe(200);
	expect(await res?.text()).toBe("body");

	// Check delete respects persist
	const deleted = await cache.delete(key);
	expect(deleted).toBe(true);
});
test("operations are no-ops when caching disabled", async ({ expect }) => {
	// Set option, then reset after test
	await ctx.setOptions({
		workers: [
			{
				config: {
					name: "",
					compatibilityDate: "2025-05-01",
				},
				dev: { cacheAPI: false },
			},
		],
	});
	onTestFinished(() => ctx.setOptions({}));
	ctx.caches = await ctx.mf.getCaches();

	const cache = ctx.caches.default;
	const key = "http://localhost/cache-disabled";

	// Check match never matches
	const resToCache = new Response("body", {
		headers: { "Cache-Control": "max-age=3600" },
	});
	await cache.put(key, resToCache.clone());
	const res = await cache.match(key);
	expect(res).toBeUndefined();

	// Check delete never deletes
	await cache.put(key, resToCache);
	const deleted = await cache.delete(key);
	expect(deleted).toBe(false);
});

test("default and named caches are disjoint", async ({ expect }) => {
	const key = "http://localhost/cache-disjoint";
	const defaultCache = ctx.caches.default;
	const namedCache1 = await ctx.caches.open("1");
	const namedCache2 = await ctx.caches.open("2");

	// Check put respects cache name
	const init: RequestInit = { headers: { "Cache-Control": "max-age=3600" } };
	await defaultCache.put(key, new Response("bodyDefault", init));
	await namedCache1.put(key, new Response("body1", init));
	await namedCache2.put(key, new Response("body2", init));

	// Check match respects cache name
	const resDefault = await defaultCache.match(key);
	const res1 = await namedCache1.match(key);
	const res2 = await namedCache2.match(key);

	expect(await resDefault?.text()).toBe("bodyDefault");
	expect(await res1?.text()).toBe("body1");
	expect(await res2?.text()).toBe("body2");

	// Check delete respects cache name
	const deletedDefault = await defaultCache.delete(key);
	const deleted1 = await namedCache1.delete(key);
	const deleted2 = await namedCache2.delete(key);
	expect(deletedDefault).toBe(true);
	expect(deleted1).toBe(true);
	expect(deleted2).toBe(true);
});

test("purgeCache clears all default cache entries", async ({ expect }) => {
	const cache = ctx.caches.default;
	const headers = { "Cache-Control": "max-age=3600" };

	// Add multiple items to cache with unique keys for this test
	await cache.put(
		"http://localhost/purge-test-key1",
		new Response("body1", { headers })
	);
	await cache.put(
		"http://localhost/purge-test-key2",
		new Response("body2", { headers })
	);
	await cache.put(
		"http://localhost/purge-test-key3",
		new Response("body3", { headers })
	);

	// Verify items are cached
	expect(await cache.match("http://localhost/purge-test-key1")).toBeDefined();
	expect(await cache.match("http://localhost/purge-test-key2")).toBeDefined();
	expect(await cache.match("http://localhost/purge-test-key3")).toBeDefined();

	// Purge cache - there may be entries from previous tests as well
	const result = await ctx.mf.purgeCache();
	expect(result).toBeGreaterThanOrEqual(3);

	// Verify our test entries are gone
	expect(await cache.match("http://localhost/purge-test-key1")).toBeUndefined();
	expect(await cache.match("http://localhost/purge-test-key2")).toBeUndefined();
	expect(await cache.match("http://localhost/purge-test-key3")).toBeUndefined();
});

test("purgeCache clears specific named cache", async ({ expect }) => {
	const defaultCache = ctx.caches.default;
	const namedCache = await ctx.caches.open("my-cache");
	const headers = { "Cache-Control": "max-age=3600" };

	await defaultCache.put(
		"http://localhost/default",
		new Response("default", { headers })
	);
	await namedCache.put(
		"http://localhost/named",
		new Response("named", { headers })
	);

	// Purge only the named cache
	await ctx.mf.purgeCache("my-cache");

	// Default cache should be intact
	expect(await defaultCache.match("http://localhost/default")).toBeDefined();
	// Named cache should be cleared
	expect(await namedCache.match("http://localhost/named")).toBeUndefined();
});

test("purgeCache returns 0 when cache is already empty", async ({ expect }) => {
	// Use a unique named cache that hasn't been used by other tests
	const result = await ctx.mf.purgeCache("empty-test-cache");
	expect(result).toBe(0);
});
