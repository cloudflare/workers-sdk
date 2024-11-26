import { SELF } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyConfigurationDefaults } from "../../packages/workers-shared/asset-worker/src/configuration";
import Worker from "../../packages/workers-shared/asset-worker/src/index";
import { getAssetWithMetadataFromKV } from "../../packages/workers-shared/asset-worker/src/utils/kv";
import { encodingTestCases } from "./test-cases/encoding-test-cases";
import { htmlHandlingTestCases } from "./test-cases/html-handling-test-cases";
import type { AssetMetadata } from "../../packages/workers-shared/asset-worker/src/utils/kv";

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

vi.mock("../../packages/workers-shared/asset-worker/src/utils/kv.ts");
vi.mock("../../packages/workers-shared/asset-worker/src/configuration");
const existsMock = (fileList: Set<string>) => {
	vi.spyOn(Worker.prototype, "unstable_exists").mockImplementation(
		async (pathname: string) => {
			if (fileList.has(pathname)) {
				return pathname;
			}
		}
	);
};
const BASE_URL = "http://example.com";

export type TestCase = {
	title: string;
	files: string[];
	requestPath: string;
	matchedFile?: string;
	finalPath?: string;
};

const testSuites = [
	{
		title: "htmlHanding options",
		suite: htmlHandlingTestCases,
	},
	{
		title: "encoding options",
		suite: encodingTestCases,
	},
];

describe.each(testSuites)("$title", ({ title, suite }) => {
	beforeEach(() => {
		vi.mocked(getAssetWithMetadataFromKV).mockImplementation(
			() =>
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
	afterEach(() => {
		vi.mocked(getAssetWithMetadataFromKV).mockRestore();
	});
	describe.each(suite)(`$html_handling`, ({ html_handling, cases }) => {
		beforeEach(() => {
			vi.mocked(applyConfigurationDefaults).mockImplementation(() => {
				return {
					html_handling,
					not_found_handling: "none",
				};
			});
		});
		it.each(cases)(
			"$title",
			async ({ files, requestPath, matchedFile, finalPath }) => {
				existsMock(new Set(files));
				const request = new IncomingRequest(BASE_URL + requestPath);
				let response = await SELF.fetch(request);
				if (matchedFile && finalPath) {
					expect(getAssetWithMetadataFromKV).toBeCalledTimes(1);
					expect(getAssetWithMetadataFromKV).toBeCalledWith(
						undefined,
						matchedFile
					);
					expect(response.status).toBe(200);
					expect(response.url).toBe(BASE_URL + finalPath);
					// can't check intermediate 307 directly:
					expect(response.redirected).toBe(requestPath !== finalPath);
				} else {
					expect(getAssetWithMetadataFromKV).not.toBeCalled();
					expect(response.status).toBe(404);
				}
			}
		);
	});
});
