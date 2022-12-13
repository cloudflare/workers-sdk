import crypto from "crypto";
import path from "path";
import { FileStorage, HeadersInit, LogLevel } from "@miniflare/tre";
import { miniflareTest, useTmp, utf8Encode } from "../../test-shared";

const test = miniflareTest(async (global, req) => {
	// Sort headers
	let name: string | undefined;
	let cfCacheKey: string | undefined;
	let bufferPut = false;
	const reqHeaders = new global.Headers();
	const resHeaders = new global.Headers();
	for (const [key, value] of req.headers) {
		const lowerKey = key.toLowerCase();
		if (lowerKey === "test-cache-name") {
			name = value;
		} else if (lowerKey === "test-cf-cache-key") {
			cfCacheKey = value;
		} else if (lowerKey === "test-buffer") {
			bufferPut = true;
		} else if (lowerKey.startsWith("test-response-")) {
			resHeaders.set(lowerKey.substring("test-response-".length), value);
		} else {
			reqHeaders.set(lowerKey, value);
		}
	}

	// Get cache and cache key
	const cache =
		name === undefined ? global.caches.default : await global.caches.open(name);
	const key = new global.Request(req.url, {
		headers: reqHeaders,
		cf: cfCacheKey === undefined ? undefined : { cacheKey: cfCacheKey },
	});

	// Perform cache operation
	if (req.method === "GET") {
		const cachedRes = await cache.match(key);
		return cachedRes ?? new global.Response("<miss>", { status: 404 });
	} else if (req.method === "PUT") {
		const body = bufferPut ? await req.arrayBuffer() : req.body;
		const res = new global.Response(body, { headers: resHeaders });
		await cache.put(key, res);
		return new global.Response(null, { status: 204 });
	} else if (req.method === "DELETE") {
		const deleted = await cache.delete(key);
		return new global.Response(null, { status: deleted ? 204 : 404 });
	} else {
		return new global.Response(null, { status: 405 });
	}
});

test("match returns cached responses", async (t) => {
	const key = "http://localhost/cache-hit";

	// Check caching stream body
	await t.context.mf.dispatchFetch(key, {
		method: "PUT",
		headers: {
			"Test-Response-Cache-Control": "max-age=3600",
			"Test-Response-X-Key": "value",
		},
		body: "body",
	});
	let res = await t.context.mf.dispatchFetch(key);
	t.is(res.status, 200);
	t.is(res.headers.get("Cache-Control"), "max-age=3600");
	t.is(res.headers.get("CF-Cache-Status"), "HIT");
	t.is(res.headers.get("X-Key"), "value"); // Check custom headers stored
	t.is(await res.text(), "body");

	// Check caching binary streamed body
	const array = new Uint8Array([1, 2, 3]);
	await t.context.mf.dispatchFetch(key, {
		method: "PUT",
		headers: { "Test-Response-Cache-Control": "max-age=3600" },
		body: array,
	});
	res = await t.context.mf.dispatchFetch(key);
	t.is(res.status, 200);
	t.deepEqual(new Uint8Array(await res.arrayBuffer()), array);

	// Check caching buffered body
	await t.context.mf.dispatchFetch(key, {
		method: "PUT",
		headers: {
			"Test-Buffer": "1",
			"Test-Response-Cache-Control": "max-age=3600",
		},
		body: "body",
	});
	res = await t.context.mf.dispatchFetch(key);
	t.is(res.status, 200);
	t.is(await res.text(), "body");
});
test("match returns nothing on cache miss", async (t) => {
	const key = "http://localhost/cache-miss";
	const res = await t.context.mf.dispatchFetch(key);
	t.is(res.status, 404);
	t.is(await res.text(), "<miss>");
});
test("match respects If-None-Match header", async (t) => {
	const key = "http://localhost/cache-if-none-match";
	await t.context.mf.dispatchFetch(key, {
		method: "PUT",
		headers: {
			"Test-Response-ETag": '"thing"',
			"Test-Response-Cache-Control": "max-age=3600",
		},
		body: "body",
	});

	const ifNoneMatch = (value: string) =>
		t.context.mf.dispatchFetch(key, { headers: { "If-None-Match": value } });

	// Check returns 304 only if an ETag in `If-Modified-Since` matches
	let res = await ifNoneMatch('"thing"');
	t.is(res.status, 304);
	res = await ifNoneMatch('   W/"thing"      ');
	t.is(res.status, 304);
	res = await ifNoneMatch('"not the thing"');
	t.is(res.status, 200);
	res = await ifNoneMatch(
		'"not the thing",    "thing"    , W/"still not the thing"'
	);
	t.is(res.status, 304);
	res = await ifNoneMatch("*");
	t.is(res.status, 304);
	res = await ifNoneMatch("    *   ");
	t.is(res.status, 304);
});
test("match respects If-Modified-Since header", async (t) => {
	const key = "http://localhost/cache-if-modified-since";
	await t.context.mf.dispatchFetch(key, {
		method: "PUT",
		headers: {
			"Test-Response-Last-Modified": "Tue, 13 Sep 2022 12:00:00 GMT",
			"Test-Response-Cache-Control": "max-age=3600",
		},
		body: "body",
	});

	const ifModifiedSince = (value: string) =>
		t.context.mf.dispatchFetch(key, {
			headers: { "If-Modified-Since": value },
		});

	// Check returns 200 if modified after `If-Modified-Since`
	let res = await ifModifiedSince("Tue, 13 Sep 2022 11:00:00 GMT");
	t.is(res.status, 200);
	// Check returns 304 if modified on `If-Modified-Since`
	res = await ifModifiedSince("Tue, 13 Sep 2022 12:00:00 GMT");
	t.is(res.status, 304);
	// Check returns 304 if modified before `If-Modified-Since`
	res = await ifModifiedSince("Tue, 13 Sep 2022 13:00:00 GMT");
	t.is(res.status, 304);
	// Check returns 200 if `If-Modified-Since` is not a "valid" UTC date
	res = await ifModifiedSince("13 Sep 2022 13:00:00 GMT");
	t.is(res.status, 200);
});
test("match respects Range header", async (t) => {
	const key = "http://localhost/cache-range";
	await t.context.mf.dispatchFetch(key, {
		method: "PUT",
		headers: {
			"Test-Response-Content-Length": "10",
			"Test-Response-Cache-Control": "max-age=3600",
		},
		body: "0123456789",
	});
	const res = await t.context.mf.dispatchFetch(key, {
		headers: { Range: "bytes=2-4" },
	});
	t.is(res.status, 206);
	t.is(res.headers.get("Content-Length"), "3");
	t.is(res.headers.get("Cache-Control"), "max-age=3600");
	t.is(res.headers.get("CF-Cache-Status"), "HIT");
	t.is(await res.text(), "234");
});

const expireMacro = test.macro({
	title(providedTitle) {
		return `expires after ${providedTitle}`;
	},
	async exec(t, opts: { headers: HeadersInit; expectedTtl: number }) {
		// Reset clock to known time, restoring afterwards.
		// Note this macro must be used with `test.serial` to avoid races.
		const originalTimestamp = t.context.clock.timestamp;
		t.teardown(() => (t.context.clock.timestamp = originalTimestamp));
		t.context.clock.timestamp = 1_000_000; // 1000s

		const key = "http://localhost/cache-expire";
		await t.context.mf.dispatchFetch(key, {
			method: "PUT",
			headers: opts.headers,
			body: "body",
		});

		let res = await t.context.mf.dispatchFetch(key);
		t.is(res.status, 200);

		t.context.clock.timestamp += opts.expectedTtl / 2;
		res = await t.context.mf.dispatchFetch(key);
		t.is(res.status, 200);

		t.context.clock.timestamp += opts.expectedTtl / 2;
		res = await t.context.mf.dispatchFetch(key);
		t.is(res.status, 404);
	},
});
test.serial("Expires", expireMacro, {
	headers: {
		"Test-Response-Expires": new Date(1000000 + 2000).toUTCString(),
	},
	expectedTtl: 2000,
});
test.serial("Cache-Control's max-age", expireMacro, {
	headers: { "Test-Response-Cache-Control": "max-age=1" },
	expectedTtl: 1000,
});
test.serial("Cache-Control's s-maxage", expireMacro, {
	headers: { "Test-Response-Cache-Control": "s-maxage=1, max-age=10" },
	expectedTtl: 1000,
});

const isCachedMacro = test.macro({
	title(providedTitle) {
		return `put ${providedTitle}`;
	},
	async exec(t, opts: { headers: Record<string, string>; cached: boolean }) {
		// Use different key for each invocation of this macro
		const headersHash = crypto
			.createHash("sha1")
			.update(JSON.stringify(opts.headers))
			.digest("hex");
		const key = `http://localhost/cache-is-cached-${headersHash}`;

		const expires = new Date(t.context.clock.timestamp + 2000).toUTCString();
		await t.context.mf.dispatchFetch(key, {
			method: "PUT",
			headers: {
				...opts.headers,
				"Test-Response-Expires": expires,
			},
			body: "body",
		});
		const res = await t.context.mf.dispatchFetch(key);
		t.is(res.status, opts.cached ? 200 : 404);
	},
});
test("does not cache with private Cache-Control", isCachedMacro, {
	headers: { "Test-Response-Cache-Control": "private" },
	cached: false,
});
test("does not cache with no-store Cache-Control", isCachedMacro, {
	headers: { "Test-Response-Cache-Control": "no-store" },
	cached: false,
});
test("does not cache with no-cache Cache-Control", isCachedMacro, {
	headers: { "Test-Response-Cache-Control": "no-cache" },
	cached: false,
});
test("does not cache with Set-Cookie", isCachedMacro, {
	headers: { "Test-Response-Set-Cookie": "key=value" },
	cached: false,
});
test(
	"caches with Set-Cookie if Cache-Control private=set-cookie",
	isCachedMacro,
	{
		headers: {
			"Test-Response-Cache-Control": "private=set-cookie",
			"Test-Response-Set-Cookie": "key=value",
		},
		cached: true,
	}
);

test("delete returns if deleted", async (t) => {
	const key = "http://localhost/cache-delete";
	await t.context.mf.dispatchFetch(key, {
		method: "PUT",
		headers: { "Test-Response-Cache-Control": "max-age=3600" },
		body: "body",
	});

	// Check first delete deletes
	let res = await t.context.mf.dispatchFetch(key, { method: "DELETE" });
	t.is(res.status, 204);

	// Check subsequent deletes don't match
	res = await t.context.mf.dispatchFetch(key, { method: "DELETE" });
	t.is(res.status, 404);
});

test("operations respect cf.cacheKey", async (t) => {
	const key = "http://localhost/cache-cf-key-unused";

	// Check put respects `cf.cacheKey`
	await t.context.mf.dispatchFetch(key, {
		method: "PUT",
		headers: {
			"Test-CF-Cache-Key": "1",
			"Test-Response-Cache-Control": "max-age=3600",
		},
		body: "body1",
	});
	await t.context.mf.dispatchFetch(key, {
		method: "PUT",
		headers: {
			"Test-CF-Cache-Key": "2",
			"Test-Response-Cache-Control": "max-age=3600",
		},
		body: "body2",
	});

	// Check match respects `cf.cacheKey`
	let res1 = await t.context.mf.dispatchFetch(key, {
		headers: { "Test-CF-Cache-Key": "1" },
	});
	let res2 = await t.context.mf.dispatchFetch(key, {
		headers: { "Test-CF-Cache-Key": "2" },
	});
	t.is(await res1.text(), "body1");
	t.is(await res2.text(), "body2");

	// Check delete respects `cf.cacheKey`
	res1 = await t.context.mf.dispatchFetch(key, {
		method: "DELETE",
		headers: { "Test-CF-Cache-Key": "1" },
	});
	res2 = await t.context.mf.dispatchFetch(key, {
		method: "DELETE",
		headers: { "Test-CF-Cache-Key": "2" },
	});
	t.is(res1.status, 204);
	t.is(res2.status, 204);
});
test.serial("operations log warning on workers.dev subdomain", async (t) => {
	// Set option, then reset after test
	await t.context.setOptions({ cacheWarnUsage: true });
	t.teardown(() => t.context.setOptions({}));

	const key = "http://localhost/cache-workers-dev-warning";

	t.context.log.logs = [];
	await t.context.mf.dispatchFetch(key, {
		method: "PUT",
		headers: { "Test-Response-Cache-Control": "max-age=3600" },
		body: "body",
	});
	t.deepEqual(t.context.log.logsAtLevel(LogLevel.WARN), [
		"Cache operations will have no impact if you deploy to a workers.dev subdomain!",
	]);

	// Check only warns once
	t.context.log.logs = [];
	await t.context.mf.dispatchFetch(key, {
		method: "PUT",
		headers: { "Test-Response-Cache-Control": "max-age=3600" },
		body: "body",
	});
	t.deepEqual(t.context.log.logsAtLevel(LogLevel.WARN), []);
});
test.serial("operations persist cached data", async (t) => {
	// Create new temporary file-system persistence directory
	const tmp = await useTmp(t);
	const clock = () => t.context.clock.timestamp;
	const storage = new FileStorage(path.join(tmp, "default"), undefined, clock);

	// Set option, then reset after test
	await t.context.setOptions({ cachePersist: tmp });
	t.teardown(() => t.context.setOptions({}));

	const key = "http://localhost/cache-persist";
	const storedKey = new URL("/cache-persist", t.context.url).toString();

	// Check put respects persist
	await t.context.mf.dispatchFetch(key, {
		method: "PUT",
		headers: { "Test-Response-Cache-Control": "max-age=3600" },
		body: "body",
	});
	let stored = await storage.get(storedKey);
	t.deepEqual(stored?.value, utf8Encode("body"));

	// Check match respects persist
	let res = await t.context.mf.dispatchFetch(key);
	t.is(res.status, 200);
	t.is(await res.text(), "body");

	// Check delete respects persist
	res = await t.context.mf.dispatchFetch(key, { method: "DELETE" });
	t.is(res.status, 204);
	stored = await storage.get(storedKey);
	t.is(stored, undefined);
});
test.serial("operations are no-ops when caching disabled", async (t) => {
	// Set option, then reset after test
	await t.context.setOptions({ cache: false });
	t.teardown(() => t.context.setOptions({}));

	const key = "http://localhost/cache-disabled";

	// Check match never matches
	await t.context.mf.dispatchFetch(key, {
		method: "PUT",
		headers: { "Test-Response-Cache-Control": "max-age=3600" },
		body: "body",
	});
	let res = await t.context.mf.dispatchFetch(key);
	t.is(res.status, 404);

	// Check delete never deletes
	await t.context.mf.dispatchFetch(key, {
		method: "PUT",
		headers: { "Test-Response-Cache-Control": "max-age=3600" },
		body: "body",
	});
	res = await t.context.mf.dispatchFetch(key, { method: "DELETE" });
	t.is(res.status, 404);
});

test("default and named caches are disjoint", async (t) => {
	const key = "http://localhost/cache-disjoint";

	// Check put respects cache name
	await t.context.mf.dispatchFetch(key, {
		method: "PUT",
		headers: { "Test-Response-Cache-Control": "max-age=3600" },
		body: "bodyDefault",
	});
	await t.context.mf.dispatchFetch(key, {
		method: "PUT",
		headers: {
			"Test-Cache-Name": "1",
			"Test-Response-Cache-Control": "max-age=3600",
		},
		body: "body1",
	});
	await t.context.mf.dispatchFetch(key, {
		method: "PUT",
		headers: {
			"Test-Cache-Name": "2",
			"Test-Response-Cache-Control": "max-age=3600",
		},
		body: "body2",
	});

	// Check match respects cache name
	let resDefault = await t.context.mf.dispatchFetch(key);
	let res1 = await t.context.mf.dispatchFetch(key, {
		headers: { "Test-Cache-Name": "1" },
	});
	let res2 = await t.context.mf.dispatchFetch(key, {
		headers: { "Test-Cache-Name": "2" },
	});
	t.is(await resDefault.text(), "bodyDefault");
	t.is(await res1.text(), "body1");
	t.is(await res2.text(), "body2");

	// Check delete respects cache name
	resDefault = await t.context.mf.dispatchFetch(key, { method: "DELETE" });
	res1 = await t.context.mf.dispatchFetch(key, {
		method: "DELETE",
		headers: { "Test-Cache-Name": "1" },
	});
	res2 = await t.context.mf.dispatchFetch(key, {
		method: "DELETE",
		headers: { "Test-Cache-Name": "2" },
	});
	t.is(resDefault.status, 204);
	t.is(res1.status, 204);
	t.is(res2.status, 204);
});
