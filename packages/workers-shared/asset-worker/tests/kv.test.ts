import { afterEach, assert, beforeEach, describe, it, vi } from "vitest";
import { getAssetWithMetadataFromKV } from "../src/utils/kv";
import type { AssetMetadata } from "../src/utils/kv";
import type { MockInstance } from "vitest";

describe("[Asset Worker] Fetching assets from KV", () => {
	describe("getAssetWithMetadataFromKV()", () => {
		let mockKVNamespace: KVNamespace;
		let spy: MockInstance;

		beforeEach(() => {
			mockKVNamespace = {
				getWithMetadata: () => Promise.resolve(),
			} as unknown as KVNamespace;

			spy = vi.spyOn(mockKVNamespace, "getWithMetadata");
		});

		afterEach(() => {
			vi.restoreAllMocks();
		});

		it("should return the asset value and metadata, if asset was found in the KV store", async ({
			expect,
		}) => {
			spy.mockReturnValueOnce(
				Promise.resolve({
					value: "<html>Hello world</html>",
					metadata: {
						contentType: "text/html",
					},
				}) as unknown as Promise<
					KVNamespaceGetWithMetadataResult<ReadableStream, AssetMetadata>
				>
			);

			const asset = await getAssetWithMetadataFromKV(mockKVNamespace, "abcd");
			assert(asset);
			expect(asset.value).toEqual("<html>Hello world</html>");
			expect(asset.metadata).toEqual({
				contentType: "text/html",
			});
			expect(spy).toHaveBeenCalledOnce();
		});

		it("should cache a found asset with the long (1 year) TTL on the first read", async ({
			expect,
		}) => {
			spy.mockReturnValueOnce(
				Promise.resolve({
					value: "<html>Hello world</html>",
					metadata: { contentType: "text/html" },
				}) as unknown as Promise<
					KVNamespaceGetWithMetadataResult<ReadableStream, AssetMetadata>
				>
			);

			await getAssetWithMetadataFromKV(mockKVNamespace, "abcd");
			expect(spy).toHaveBeenNthCalledWith(1, "abcd", {
				type: "stream",
				cacheTtl: 31536000,
			});
		});

		it("should throw an error if something went wrong while fetching the asset", async ({
			expect,
		}) => {
			spy.mockReturnValue(Promise.reject("Oeps! Something went wrong"));

			await expect(() =>
				getAssetWithMetadataFromKV(mockKVNamespace, "abcd")
			).rejects.toThrow("KV GET abcd failed.");
		});

		it("should retry up to 3 times by default if something went wrong while fetching the asset", async ({
			expect,
		}) => {
			spy.mockReturnValue(Promise.reject("Oeps! Something went wrong"));

			await expect(() =>
				getAssetWithMetadataFromKV(mockKVNamespace, "abcd")
			).rejects.toThrow("KV GET abcd failed.");
			// Initial attempt + 3 retries
			expect(spy).toHaveBeenCalledTimes(4);
		});

		it("should support a custom number of retries", async ({ expect }) => {
			spy.mockReturnValue(Promise.reject("Oeps! Something went wrong"));

			await expect(() =>
				getAssetWithMetadataFromKV(mockKVNamespace, "abcd", undefined, 2)
			).rejects.toThrow("KV GET abcd failed.");
			// Initial attempt + 2 retries
			expect(spy).toHaveBeenCalledTimes(3);
		});

		it("should inject message with error", async ({ expect }) => {
			spy.mockReturnValue(
				Promise.reject(new Error("Oeps! Something went wrong"))
			);

			await expect(() =>
				getAssetWithMetadataFromKV(mockKVNamespace, "abcd", undefined, 1)
			).rejects.toThrow("KV GET abcd failed: Oeps! Something went wrong");
			expect(spy).toHaveBeenCalledTimes(2);
		});

		it("should retry on a null value and resolve once the asset has propagated", async ({
			expect,
		}) => {
			let attempts = 0;
			spy.mockImplementation(() => {
				if (attempts++ === 0) {
					return Promise.resolve({
						value: null,
					}) as unknown as Promise<
						KVNamespaceGetWithMetadataResult<ReadableStream, AssetMetadata>
					>;
				} else {
					return Promise.resolve({
						value: "<html>Hello world</html>",
						metadata: {
							contentType: "text/html",
						},
					}) as unknown as Promise<
						KVNamespaceGetWithMetadataResult<ReadableStream, AssetMetadata>
					>;
				}
			});

			const asset = await getAssetWithMetadataFromKV(mockKVNamespace, "abcd");
			expect(asset?.value).toBeTruthy();
			// Once for the initial (null) call, once for the successful retry
			expect(spy).toHaveBeenCalledTimes(2);
		});

		it("should use the short (60s) TTL when retrying after a null value", async ({
			expect,
		}) => {
			let attempts = 0;
			spy.mockImplementation(() => {
				if (attempts++ === 0) {
					return Promise.resolve({
						value: null,
					}) as unknown as Promise<
						KVNamespaceGetWithMetadataResult<ReadableStream, AssetMetadata>
					>;
				}
				return Promise.resolve({
					value: "<html>Hello world</html>",
					metadata: { contentType: "text/html" },
				}) as unknown as Promise<
					KVNamespaceGetWithMetadataResult<ReadableStream, AssetMetadata>
				>;
			});

			await getAssetWithMetadataFromKV(mockKVNamespace, "abcd");
			expect(spy).toHaveBeenNthCalledWith(1, "abcd", {
				type: "stream",
				cacheTtl: 31536000,
			});
			expect(spy).toHaveBeenNthCalledWith(2, "abcd", {
				type: "stream",
				cacheTtl: 60,
			});
		});

		it("should retry a persistent null up to the retry limit then return the null result", async ({
			expect,
		}) => {
			spy.mockReturnValue(
				Promise.resolve({ value: null }) as unknown as Promise<
					KVNamespaceGetWithMetadataResult<ReadableStream, AssetMetadata>
				>
			);

			const asset = await getAssetWithMetadataFromKV(mockKVNamespace, "abcd");
			expect(asset?.value).toBeNull();
			// Initial attempt + 3 retries, all null
			expect(spy).toHaveBeenCalledTimes(4);
		});
	});
});
