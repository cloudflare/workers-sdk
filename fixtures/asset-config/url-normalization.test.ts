import { SELF } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyConfigurationDefaults } from "../../packages/workers-shared/asset-worker/src/configuration";
import Worker from "../../packages/workers-shared/asset-worker/src/index";
import { getAssetWithMetadataFromKV } from "../../packages/workers-shared/asset-worker/src/utils/kv";
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

describe("[Asset Worker] `test slash normalization`", () => {
	afterEach(() => {
		vi.mocked(getAssetWithMetadataFromKV).mockRestore();
	});
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

		vi.mocked(applyConfigurationDefaults).mockImplementation(() => {
			return {
				html_handling: "none",
				not_found_handling: "none",
				run_worker_first: true,
				serve_directly: false,
			};
		});
	});

	it("returns 200 leading encoded double slash", async () => {
		const files = ["/blog/index.html"];
		const requestPath = "/%2fblog/index.html";

		existsMock(new Set(files));
		const request = new IncomingRequest(BASE_URL + requestPath);
		let response = await SELF.fetch(request);
		expect(response.status).toBe(200);
	});

	it("returns 200 leading non encoded double slash", async () => {
		const files = ["/blog/index.html"];
		const requestPath = "//blog/index.html";

		existsMock(new Set(files));
		const request = new IncomingRequest(BASE_URL + requestPath);
		let response = await SELF.fetch(request);
		expect(response.status).toBe(200);
	});

	it("returns 404 for non matched url", async () => {
		const files = ["/blog/index.html"];
		const requestPath = "/%2fexample.com/";

		existsMock(new Set(files));
		const request = new IncomingRequest(BASE_URL + requestPath);
		let response = await SELF.fetch(request);
		expect(response.status).toBe(404);
	});
});
