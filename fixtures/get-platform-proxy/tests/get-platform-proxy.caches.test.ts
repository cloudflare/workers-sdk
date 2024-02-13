import { Request, Response } from "undici";
import { describe, expect, it } from "vitest";
import { getPlatformProxy } from "./shared";

describe("getPlatformProxy - caches", () => {
	(["default", "named"] as const).forEach((cacheType) =>
		it(`correctly obtains a no-op ${cacheType} cache`, async () => {
			const { caches, dispose } = await getPlatformProxy();
			try {
				const cache =
					cacheType === "default"
						? caches.default
						: await caches.open("my-cache");
				testNoOpCache(cache);
			} finally {
				await dispose();
			}
		})
	);
});

async function testNoOpCache(
	cache: Awaited<ReturnType<typeof getPlatformProxy>>["caches"]["default"]
) {
	let match = await cache.match("http://0.0.0.0/test");
	expect(match).toBeUndefined();

	const req = new Request("http://0.0.0.0/test");
	await cache.put(req, new Response("test"));
	const resp = await cache.match(req);
	expect(resp).toBeUndefined();
	const deleted = await cache.delete(req);
	expect(deleted).toBe(false);
}
