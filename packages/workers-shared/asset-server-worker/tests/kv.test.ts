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

		it("should return the asset value and metadata, if asset was found in the KV store", async () => {
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
			expect(asset).toBeDefined();
			expect(asset?.value).toEqual("<html>Hello world</html>");
			expect(asset?.metadata).toEqual({
				contentType: "text/html",
			});
			expect(spy).toHaveBeenCalledOnce();
		});

		it("should throw an error if something went wrong while fetching the asset", async () => {
			spy.mockReturnValue(Promise.reject("Oeps! Something went wrong"));

			await expect(() =>
				getAssetWithMetadataFromKV(mockKVNamespace, "abcd")
			).rejects.toThrowError(
				"Requested asset abcd could not be fetched from KV namespace."
			);
		});

		it("should retry once by default if something went wrong while fetching the asset", async () => {
			spy.mockReturnValue(Promise.reject("Oeps! Something went wrong"));

			await expect(() =>
				getAssetWithMetadataFromKV(mockKVNamespace, "abcd")
			).rejects.toThrowError(
				"Requested asset abcd could not be fetched from KV namespace."
			);
			expect(spy).toHaveBeenCalledTimes(2);
		});

		it("should support custom number of retries", async () => {
			spy.mockReturnValue(Promise.reject("Oeps! Something went wrong"));

			await expect(() =>
				getAssetWithMetadataFromKV(mockKVNamespace, "abcd", 2)
			).rejects.toThrowError(
				"Requested asset abcd could not be fetched from KV namespace."
			);
			expect(spy).toHaveBeenCalledTimes(3);
		});
	});
});
