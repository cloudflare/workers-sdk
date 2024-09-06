import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../../packages/workers-shared/asset-worker/src/index";
import { getAssetWithMetadataFromKV } from "../../packages/workers-shared/asset-worker/src/utils/kv";
import type { AssetMetadata } from "../../packages/workers-shared/asset-worker/src/utils/kv";

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

vi.mock("../../packages/workers-shared/asset-worker/src/utils/kv.ts");
const existsMock = (fileList: Set<string>) => {
	vi.spyOn(worker.prototype, "exists").mockImplementation(
		async (pathname: string) => {
			if (fileList.has(pathname)) {
				return pathname;
			}
		}
	);
};
const BASE_URL = "http://example.com";

type TestCase = {
	files: string[];
	requestPath: string;
	matchedFile: string;
	finalPath: string;
	// redirected?: boolean;
};

const testCases: TestCase[] = [
	{
		files: ["/index.html"],
		requestPath: "/index.html",
		matchedFile: "/index.html",
		finalPath: "/",
	},
	{
		files: ["/both.html", "/both/index.html"],
		requestPath: "/both",
		matchedFile: "/both.html",
		finalPath: "/both",
	},
	{
		files: ["/both.html", "/both/index.html"],
		requestPath: "/both/",
		matchedFile: "/both/index.html",
		finalPath: "/both/",
	},
	{
		files: ["/both.html", "/both/index.html"],
		requestPath: "/both.html",
		matchedFile: "/both.html",
		finalPath: "/both",
	},
	{
		files: ["/both.html", "/both/index.html"],
		requestPath: "/both/index.html",
		matchedFile: "/both/index.html",
		finalPath: "/both/",
	},
];

describe("default config", () => {
	// serveExactMatchesOnly: false;
	// trailingSlashes: "auto"
	// notFoundBehavior: "default"

	beforeEach(() => {
		vi.mocked(getAssetWithMetadataFromKV).mockReturnValueOnce(
			Promise.resolve({
				value: "no-op",
				metadata: {
					contentType: "no-op",
				},
			}) as unknown as Promise<
				KVNamespaceGetWithMetadataResult<ReadableStream, AssetMetadata>
			>
		);
	});
	it.each(testCases)(
		"default config",
		async ({ files, requestPath, matchedFile, finalPath }) => {
			existsMock(new Set(files));
			const request = new IncomingRequest(BASE_URL + requestPath);

			let response = await SELF.fetch(request, env);

			expect(getAssetWithMetadataFromKV).toBeCalledWith(undefined, matchedFile);
			expect(response.status).toBe(200);
			expect(response.url).toBe(BASE_URL + finalPath);
			expect(response.redirected).toBe(requestPath !== finalPath);
		}
	);
});
