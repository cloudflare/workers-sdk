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

				let match = await cache.match("http://0.0.0.0/test");
				expect(match).toBeUndefined();

				const req = new Request("http://0.0.0.0/test");
				await cache.put(req, new Response("test"));

				const resp = await cache.match(req);
				expect(resp).toBeUndefined();

				const deleted = await cache.delete(req);
				expect(deleted).toBe(false);
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
