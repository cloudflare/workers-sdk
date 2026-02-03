import { beforeEach, test } from "vitest";
import { getAssetFromKV, mapRequestToAsset } from "../src/index";
import {
	getEvent,
	mockGlobalScope,
	mockKV,
	mockManifest,
	mockRequestScope,
	sleep,
} from "./mocks";

beforeEach(async () => {
	mockGlobalScope();
	mockRequestScope();
});

test("getAssetFromKV return correct val from KV and default caching", async ({
	expect,
}) => {
	const event = getEvent(new Request("https://blah.com/key1.txt"));
	const res = await getAssetFromKV(event);

	if (res) {
		expect(res.headers.get("cache-control")).toBe(null);
		expect(res.headers.get("cf-cache-status")).toBe("MISS");
		expect(await res.text()).toBe("val1");
		expect(res.headers.get("content-type")).toContain("text");
	} else {
		expect.fail("Response was undefined");
	}
});
test("getAssetFromKV evaluated the file matching the extensionless path first /client/ -> client", async ({
	expect,
}) => {
	const event = getEvent(new Request(`https://foo.com/client/`));
	const res = await getAssetFromKV(event);
	expect(await res.text()).toBe("important file");
	expect(res.headers.get("content-type")).toContain("text");
});
test("getAssetFromKV evaluated the file matching the extensionless path first /client -> client", async ({
	expect,
}) => {
	const event = getEvent(new Request(`https://foo.com/client`));
	const res = await getAssetFromKV(event);
	expect(await res.text()).toBe("important file");
	expect(res.headers.get("content-type")).toContain("text");
});

test("getAssetFromKV if not in asset manifest still returns nohash.txt", async ({
	expect,
}) => {
	const event = getEvent(new Request("https://blah.com/nohash.txt"));
	const res = await getAssetFromKV(event);

	if (res) {
		expect(await res.text()).toBe("no hash but still got some result");
		expect(res.headers.get("content-type")).toContain("text");
	} else {
		expect.fail("Response was undefined");
	}
});

test("getAssetFromKV if no asset manifest /client -> client fails", async ({
	expect,
}) => {
	const event = getEvent(new Request(`https://foo.com/client`));
	await expect(() =>
		getAssetFromKV(event, { ASSET_MANIFEST: {} })
	).rejects.toThrowError(expect.objectContaining({ status: 404 }));
});

test("getAssetFromKV if sub/ -> sub/index.html served", async ({ expect }) => {
	const event = getEvent(new Request(`https://foo.com/sub`));
	const res = await getAssetFromKV(event);
	if (res) {
		expect(await res.text()).toBe("picturedis");
	} else {
		expect.fail("Response was undefined");
	}
});

test("getAssetFromKV gets index.html by default for / requests", async ({
	expect,
}) => {
	const event = getEvent(new Request("https://blah.com/"));
	const res = await getAssetFromKV(event);

	if (res) {
		expect(await res.text()).toBe("index.html");
		expect(res.headers.get("content-type")).toContain("html");
	} else {
		expect.fail("Response was undefined");
	}
});

test("getAssetFromKV non ASCII path support", async ({ expect }) => {
	const event = getEvent(new Request("https://blah.com/测试.html"));
	const res = await getAssetFromKV(event);

	if (res) {
		expect(await res.text()).toBe("My filename is non-ascii");
	} else {
		expect.fail("Response was undefined");
	}
});

test("getAssetFromKV supports browser percent encoded URLs", async ({
	expect,
}) => {
	const event = getEvent(
		new Request("https://example.com/%not-really-percent-encoded.html")
	);
	const res = await getAssetFromKV(event);

	if (res) {
		expect(await res.text()).toBe("browser percent encoded");
	} else {
		expect.fail("Response was undefined");
	}
});

test("getAssetFromKV supports user percent encoded URLs", async ({
	expect,
}) => {
	const event = getEvent(new Request("https://blah.com/%2F.html"));
	const res = await getAssetFromKV(event);

	if (res) {
		expect(await res.text()).toBe("user percent encoded");
	} else {
		expect.fail("Response was undefined");
	}
});

test("getAssetFromKV only decode URL when necessary", async ({ expect }) => {
	const event1 = getEvent(
		new Request("https://blah.com/%E4%BD%A0%E5%A5%BD.html")
	);
	const event2 = getEvent(new Request("https://blah.com/你好.html"));
	const res1 = await getAssetFromKV(event1);
	const res2 = await getAssetFromKV(event2);

	if (res1 && res2) {
		expect(await res1.text()).toBe("Im important");
		expect(await res2.text()).toBe("Im important");
	} else {
		expect.fail("Response was undefined");
	}
});

test("getAssetFromKV Support for user decode url path", async ({ expect }) => {
	const event1 = getEvent(new Request("https://blah.com/%E4%BD%A0%E5%A5%BD/"));
	const event2 = getEvent(new Request("https://blah.com/你好/"));
	const res1 = await getAssetFromKV(event1);
	const res2 = await getAssetFromKV(event2);

	if (res1 && res2) {
		expect(await res1.text()).toBe("My path is non-ascii");
		expect(await res2.text()).toBe("My path is non-ascii");
	} else {
		expect.fail("Response was undefined");
	}
});

test("getAssetFromKV custom key modifier", async ({ expect }) => {
	const event = getEvent(new Request("https://blah.com/docs/sub/blah.png"));

	const customRequestMapper = (request: Request) => {
		const defaultModifiedRequest = mapRequestToAsset(request);

		const url = new URL(defaultModifiedRequest.url);
		url.pathname = url.pathname.replace("/docs", "");
		return new Request(url.toString(), request);
	};

	const res = await getAssetFromKV(event, {
		mapRequestToAsset: customRequestMapper,
	});

	if (res) {
		expect(await res.text()).toBe("picturedis");
	} else {
		expect.fail("Response was undefined");
	}
});

test("getAssetFromKV request override with existing manifest file", async ({
	expect,
}) => {
	// see https://github.com/cloudflare/kv-asset-handler/pull/159 for more info
	const event = getEvent(new Request("https://blah.com/image.png")); // real file in manifest

	const customRequestMapper = (request: Request) => {
		const defaultModifiedRequest = mapRequestToAsset(request);

		const url = new URL(defaultModifiedRequest.url);
		url.pathname = "/image.webp"; // other different file in manifest
		return new Request(url.toString(), request);
	};

	const res = await getAssetFromKV(event, {
		mapRequestToAsset: customRequestMapper,
	});

	if (res) {
		expect(await res.text()).toBe("imagewebp");
	} else {
		expect.fail("Response was undefined");
	}
});

test("getAssetFromKV when setting browser caching", async ({ expect }) => {
	const event = getEvent(new Request("https://blah.com/"));

	const res = await getAssetFromKV(event, { cacheControl: { browserTTL: 22 } });

	if (res) {
		expect(res.headers.get("cache-control")).toBe("max-age=22");
	} else {
		expect.fail("Response was undefined");
	}
});

test("getAssetFromKV when setting custom cache setting", async ({ expect }) => {
	const event1 = getEvent(new Request("https://blah.com/"));
	const event2 = getEvent(new Request("https://blah.com/key1.png?blah=34"));
	const cacheOnlyPngs = (req: Request) => {
		if (new URL(req.url).pathname.endsWith(".png")) {
			return {
				browserTTL: 720,
				edgeTTL: 720,
			};
		} else {
			return {
				bypassCache: true,
			};
		}
	};

	const res1 = await getAssetFromKV(event1, { cacheControl: cacheOnlyPngs });
	const res2 = await getAssetFromKV(event2, { cacheControl: cacheOnlyPngs });

	if (res1 && res2) {
		expect(res1.headers.get("cache-control")).toBe(null);
		expect(res2.headers.get("content-type")).toContain("png");
		expect(res2.headers.get("cache-control")).toBe("max-age=720");
		expect(res2.headers.get("cf-cache-status")).toBe("MISS");
	} else {
		expect.fail("Response was undefined");
	}
});
test("getAssetFromKV caches on two sequential requests", async ({ expect }) => {
	const resourceKey = "cache.html";
	const resourceVersion = JSON.parse(mockManifest())[resourceKey];
	const event1 = getEvent(new Request(`https://blah.com/${resourceKey}`));
	const event2 = getEvent(
		new Request(`https://blah.com/${resourceKey}`, {
			headers: {
				"if-none-match": `"${resourceVersion}"`,
			},
		})
	);

	const res1 = await getAssetFromKV(event1, {
		cacheControl: { edgeTTL: 720, browserTTL: 720 },
	});
	await sleep(1);
	const res2 = await getAssetFromKV(event2);

	if (res1 && res2) {
		expect(res1.headers.get("cf-cache-status")).toBe("MISS");
		expect(res1.headers.get("cache-control")).toBe("max-age=720");
		expect(res2.headers.get("cf-cache-status")).toBe("REVALIDATED");
	} else {
		expect.fail("Response was undefined");
	}
});
test("getAssetFromKV does not store max-age on two sequential requests", async ({
	expect,
}) => {
	const resourceKey = "cache.html";
	const resourceVersion = JSON.parse(mockManifest())[resourceKey];
	const event1 = getEvent(new Request(`https://blah.com/${resourceKey}`));
	const event2 = getEvent(
		new Request(`https://blah.com/${resourceKey}`, {
			headers: {
				"if-none-match": `"${resourceVersion}"`,
			},
		})
	);

	const res1 = await getAssetFromKV(event1, { cacheControl: { edgeTTL: 720 } });
	await sleep(100);
	const res2 = await getAssetFromKV(event2);

	if (res1 && res2) {
		expect(res1.headers.get("cf-cache-status")).toBe("MISS");
		expect(res1.headers.get("cache-control")).toBe(null);
		expect(res2.headers.get("cf-cache-status")).toBe("REVALIDATED");
		expect(res2.headers.get("cache-control")).toBe(null);
	} else {
		expect.fail("Response was undefined");
	}
});

test("getAssetFromKV does not cache on Cloudflare when bypass cache set", async ({
	expect,
}) => {
	const event = getEvent(new Request("https://blah.com/"));

	const res = await getAssetFromKV(event, {
		cacheControl: { bypassCache: true },
	});

	if (res) {
		expect(res.headers.get("cache-control")).toBe(null);
		expect(res.headers.get("cf-cache-status")).toBe(null);
	} else {
		expect.fail("Response was undefined");
	}
});

test("getAssetFromKV with no trailing slash on root", async ({ expect }) => {
	const event = getEvent(new Request("https://blah.com"));
	const res = await getAssetFromKV(event);
	if (res) {
		expect(await res.text()).toBe("index.html");
	} else {
		expect.fail("Response was undefined");
	}
});

test("getAssetFromKV with no trailing slash on a subdirectory", async ({
	expect,
}) => {
	const event = getEvent(new Request("https://blah.com/sub/blah.png"));
	const res = await getAssetFromKV(event);
	if (res) {
		expect(await res.text()).toBe("picturedis");
	} else {
		expect.fail("Response was undefined");
	}
});

test("getAssetFromKV no result throws an error", async ({ expect }) => {
	const event = getEvent(new Request("https://blah.com/random"));
	await expect(getAssetFromKV(event)).rejects.toThrow(
		expect.objectContaining({ status: 404 })
	);
});
test("getAssetFromKV TTls set to null should not cache on browser or edge", async ({
	expect,
}) => {
	const event = getEvent(new Request("https://blah.com/"));

	const res1 = await getAssetFromKV(event, {
		cacheControl: { browserTTL: null, edgeTTL: null },
	});
	await sleep(100);
	const res2 = await getAssetFromKV(event, {
		cacheControl: { browserTTL: null, edgeTTL: null },
	});

	if (res1 && res2) {
		expect(res1.headers.get("cf-cache-status")).toBe(null);
		expect(res1.headers.get("cache-control")).toBe(null);
		expect(res2.headers.get("cf-cache-status")).toBe(null);
		expect(res2.headers.get("cache-control")).toBe(null);
	} else {
		expect.fail("Response was undefined");
	}
});
test("getAssetFromKV passing in a custom NAMESPACE serves correct asset", async ({
	expect,
}) => {
	const CUSTOM_NAMESPACE = mockKV({
		"key1.123HASHBROWN.txt": "val1",
	});
	Object.assign(globalThis, { CUSTOM_NAMESPACE });
	const event = getEvent(new Request("https://blah.com/"));
	const res = await getAssetFromKV(event);
	if (res) {
		expect(await res.text()).toBe("index.html");
		expect(res.headers.get("content-type")).toContain("html");
	} else {
		expect.fail("Response was undefined");
	}
});
test("getAssetFromKV when custom namespace without the asset should fail", async ({
	expect,
}) => {
	const CUSTOM_NAMESPACE = mockKV({
		"key5.123HASHBROWN.txt": "customvalu",
	});

	const event = getEvent(new Request("https://blah.com"));
	await expect(
		getAssetFromKV(event, { ASSET_NAMESPACE: CUSTOM_NAMESPACE })
	).rejects.toThrow(expect.objectContaining({ status: 404 }));
});
test("getAssetFromKV when namespace not bound fails", async ({ expect }) => {
	const MY_CUSTOM_NAMESPACE: KVNamespace = undefined;
	Object.assign(globalThis, { MY_CUSTOM_NAMESPACE });

	const event = getEvent(new Request("https://blah.com/"));
	await expect(
		getAssetFromKV(event, { ASSET_NAMESPACE: MY_CUSTOM_NAMESPACE })
	).rejects.toThrow(expect.objectContaining({ status: 500 }));
});

test("getAssetFromKV when if-none-match === active resource version, should revalidate", async ({
	expect,
}) => {
	const resourceKey = "key1.png";
	const resourceVersion = JSON.parse(mockManifest())[resourceKey];
	const event1 = getEvent(new Request(`https://blah.com/${resourceKey}`));
	const event2 = getEvent(
		new Request(`https://blah.com/${resourceKey}`, {
			headers: {
				"if-none-match": `W/"${resourceVersion}"`,
			},
		})
	);

	const res1 = await getAssetFromKV(event1, { cacheControl: { edgeTTL: 720 } });
	await sleep(100);
	const res2 = await getAssetFromKV(event2);

	if (res1 && res2) {
		expect(res1.headers.get("cf-cache-status")).toBe("MISS");
		expect(res2.headers.get("cf-cache-status")).toBe("REVALIDATED");
	} else {
		expect.fail("Response was undefined");
	}
});

test("getAssetFromKV when if-none-match equals etag of stale resource then should bypass cache", async ({
	expect,
}) => {
	const resourceKey = "key1.png";
	const resourceVersion = JSON.parse(mockManifest())[resourceKey];
	const req1 = new Request(`https://blah.com/${resourceKey}`, {
		headers: {
			"if-none-match": `"${resourceVersion}"`,
		},
	});
	const req2 = new Request(`https://blah.com/${resourceKey}`, {
		headers: {
			"if-none-match": `"${resourceVersion}-another-version"`,
		},
	});
	const event = getEvent(req1);
	const event2 = getEvent(req2);
	const res1 = await getAssetFromKV(event, { cacheControl: { edgeTTL: 720 } });
	const res2 = await getAssetFromKV(event);
	const res3 = await getAssetFromKV(event2);
	if (res1 && res2 && res3) {
		expect(res1.headers.get("cf-cache-status")).toBe("MISS");
		expect(res2.headers.get("etag")).toBe(
			`W/${req1.headers.get("if-none-match")}`
		);
		expect(res2.headers.get("cf-cache-status")).toBe("REVALIDATED");
		expect(res3.headers.get("etag")).not.toBe(
			req2.headers.get("if-none-match")
		);
		expect(res3.headers.get("cf-cache-status")).toBe("MISS");
	} else {
		expect.fail("Response was undefined");
	}
});
test("getAssetFromKV when resource in cache, etag should be weakened before returned to eyeball", async ({
	expect,
}) => {
	const resourceKey = "key1.png";
	const resourceVersion = JSON.parse(mockManifest())[resourceKey];
	const req1 = new Request(`https://blah.com/${resourceKey}`, {
		headers: {
			"if-none-match": `"${resourceVersion}"`,
		},
	});
	const event = getEvent(req1);
	const res1 = await getAssetFromKV(event, { cacheControl: { edgeTTL: 720 } });
	const res2 = await getAssetFromKV(event);
	if (res1 && res2) {
		expect(res1.headers.get("cf-cache-status")).toBe("MISS");
		expect(res2.headers.get("etag")).toBe(
			`W/${req1.headers.get("if-none-match")}`
		);
	} else {
		expect.fail("Response was undefined");
	}
});
test("getAssetFromKV should support weak etag override of resource", async ({
	expect,
}) => {
	const resourceKey = "key1.png";
	const resourceVersion = JSON.parse(mockManifest())[resourceKey];
	const req1 = new Request(`https://blah-weak.com/${resourceKey}`, {
		headers: {
			"if-none-match": `W/"${resourceVersion}"`,
		},
	});
	const req2 = new Request(`https://blah-weak.com/${resourceKey}`, {
		headers: {
			"if-none-match": `"${resourceVersion}"`,
		},
	});
	const req3 = new Request(`https://blah-weak.com/${resourceKey}`, {
		headers: {
			"if-none-match": `"${resourceVersion}-another-version"`,
		},
	});
	const event1 = getEvent(req1);
	const event2 = getEvent(req2);
	const event3 = getEvent(req3);
	const res1 = await getAssetFromKV(event1, { defaultETag: "weak" });
	const res2 = await getAssetFromKV(event2, { defaultETag: "weak" });
	const res3 = await getAssetFromKV(event3, { defaultETag: "weak" });
	if (res1 && res2 && res3) {
		expect(res1.headers.get("cf-cache-status")).toBe("MISS");
		expect(res1.headers.get("etag")).toBe(req1.headers.get("if-none-match"));
		expect(res2.headers.get("cf-cache-status")).toBe("REVALIDATED");
		expect(res2.headers.get("etag")).toBe(
			`W/${req2.headers.get("if-none-match")}`
		);
		expect(res3.headers.get("cf-cache-status")).toBe("MISS");
		expect(res3.headers.get("etag")).not.toBe(
			req2.headers.get("if-none-match")
		);
	} else {
		expect.fail("Response was undefined");
	}
});

test("getAssetFromKV if-none-match not sent but resource in cache, should return cache hit 200 OK", async ({
	expect,
}) => {
	const resourceKey = "cache.html";
	const event = getEvent(new Request(`https://blah.com/${resourceKey}`));
	const res1 = await getAssetFromKV(event, { cacheControl: { edgeTTL: 720 } });
	await sleep(1);
	const res2 = await getAssetFromKV(event);
	if (res1 && res2) {
		expect(res1.headers.get("cf-cache-status")).toBe("MISS");
		expect(res1.headers.get("cache-control")).toBe(null);
		expect(res2.status).toBe(200);
		expect(res2.headers.get("cf-cache-status")).toBe("HIT");
	} else {
		expect.fail("Response was undefined");
	}
});

test("getAssetFromKV if range request submitted and resource in cache, request fulfilled", async ({
	expect,
}) => {
	const resourceKey = "cache.html";
	const event1 = getEvent(new Request(`https://blah.com/${resourceKey}`));
	const event2 = getEvent(
		new Request(`https://blah.com/${resourceKey}`, {
			headers: { range: "bytes=0-10" },
		})
	);
	const res1 = getAssetFromKV(event1, { cacheControl: { edgeTTL: 720 } });
	await res1;
	await sleep(2);
	const res2 = await getAssetFromKV(event2);
	if (res2.headers.has("content-range")) {
		expect(res2.status).toBe(206);
	} else {
		expect.fail("Response was undefined");
	}
});

test.todo("getAssetFromKV when body not empty, should invoke .cancel()");
