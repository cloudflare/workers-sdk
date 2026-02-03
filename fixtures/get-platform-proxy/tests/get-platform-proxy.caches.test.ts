import { Request, Response } from "undici";
import { describe, it } from "vitest";
import { getPlatformProxy } from "./shared";

describe("getPlatformProxy - caches", () => {
	(["default", "named"] as const).forEach((cacheType) =>
		it(`correctly obtains a no-op ${cacheType} cache`, async ({ expect }) => {
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

	it("should match the production runtime caches object", async ({
		expect,
	}) => {
		const { caches: platformProxyCaches, dispose } = await getPlatformProxy();
		const caches = platformProxyCaches as any;
		try {
			expect(Object.keys(caches)).toEqual(["default"]);

			expect(() => {
				caches.has("my-cache");
			}).toThrowError(
				"Failed to execute 'has' on 'CacheStorage': the method is not implemented."
			);

			expect(() => {
				caches.delete("my-cache");
			}).toThrowError(
				"Failed to execute 'delete' on 'CacheStorage': the method is not implemented."
			);

			expect(() => {
				caches.keys();
			}).toThrowError(
				"Failed to execute 'keys' on 'CacheStorage': the method is not implemented."
			);

			expect(() => {
				caches.match(new URL("https://localhost"));
			}).toThrowError(
				"Failed to execute 'match' on 'CacheStorage': the method is not implemented."
			);

			expect(() => {
				caches.nonExistentMethod();
			}).toThrowError("caches.nonExistentMethod is not a function");
		} finally {
			await dispose();
		}
	});
});

async function testNoOpCache(
	cache: Awaited<ReturnType<typeof getPlatformProxy>>["caches"]["default"]
) {
	let match = await cache.match("http://0.0.0.0/test");
	// Note: we cannot use expect here since it's not in the test context
	if (match !== undefined) {
		throw new Error("Expected match to be undefined");
	}

	const req = new Request("http://0.0.0.0/test");
	await cache.put(req, new Response("test"));
	const resp = await cache.match(req);
	if (resp !== undefined) {
		throw new Error("Expected resp to be undefined");
	}
	const deleted = await cache.delete(req);
	if (deleted !== false) {
		throw new Error("Expected deleted to be false");
	}
}
