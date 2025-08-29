import Worker from "@cloudflare/workers-shared/asset-worker";
import { normalizeConfiguration } from "@cloudflare/workers-shared/asset-worker/src/configuration";
import { getAssetWithMetadataFromKV } from "@cloudflare/workers-shared/asset-worker/src/utils/kv";
import { SELF } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, Mock, vi } from "vitest";

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;
type AssetMetadata = {
	contentType: string;
};

vi.mock("@cloudflare/workers-shared/asset-worker/src/utils/kv.ts");
vi.mock("@cloudflare/workers-shared/asset-worker/src/configuration");
const existsMock = (fileList: Set<string>) => {
	vi.spyOn(Worker.prototype, "unstable_exists").mockImplementation(
		async (pathname: string) => {
			if (fileList.has(pathname)) {
				return pathname;
			}
			return null;
		}
	);
};
const BASE_URL = "http://example.com";

describe("[Asset Worker] `test slash normalization`", () => {
	afterEach(() => {
		vi.mocked(getAssetWithMetadataFromKV).mockRestore();
	});
	beforeEach(async () => {
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

		const originalApplyConfigurationDefaults = (
			await vi.importActual<
				typeof import("@cloudflare/workers-shared/asset-worker/src/configuration")
			>("@cloudflare/workers-shared/asset-worker/src/configuration")
		).normalizeConfiguration;
		vi.mocked(normalizeConfiguration).mockImplementation(() => ({
			...originalApplyConfigurationDefaults({}),
			html_handling: "none",
			not_found_handling: "none",
		}));
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
