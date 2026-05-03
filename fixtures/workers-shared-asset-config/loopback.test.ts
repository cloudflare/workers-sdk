import Worker, {
	AssetWorkerInner,
} from "@cloudflare/workers-shared/asset-worker";
import { normalizeConfiguration } from "@cloudflare/workers-shared/asset-worker/src/configuration";
import { getAssetWithMetadataFromKV } from "@cloudflare/workers-shared/asset-worker/src/utils/kv";
import { SELF } from "cloudflare:test";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import type { AssetMetadata } from "@cloudflare/workers-shared/asset-worker/src/utils/kv";

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

vi.mock("@cloudflare/workers-shared/asset-worker/src/utils/kv.ts");
vi.mock("@cloudflare/workers-shared/asset-worker/src/configuration");

describe("[Asset Worker] loopback", () => {
	beforeEach(async () => {
		vi.mocked(getAssetWithMetadataFromKV).mockImplementation(
			() =>
				Promise.resolve({
					value: "no-op",
					metadata: {
						contentType: "application/octet-stream",
					},
				}) as unknown as Promise<
					KVNamespaceGetWithMetadataResult<ReadableStream, AssetMetadata>
				>
		);

		const originalNormalizeConfiguration = (
			await vi.importActual<
				typeof import("@cloudflare/workers-shared/asset-worker/src/configuration")
			>("@cloudflare/workers-shared/asset-worker/src/configuration")
		).normalizeConfiguration;

		vi.mocked(normalizeConfiguration).mockImplementation(() => ({
			...originalNormalizeConfiguration({}),
			html_handling: "none",
			not_found_handling: "none",
		}));
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("uses AssetWorkerInner for fetch path resolution", async ({ expect }) => {
		const outerExists = vi
			.spyOn(Worker.prototype, "unstable_exists")
			.mockResolvedValue(null);
		const innerExists = vi
			.spyOn(AssetWorkerInner.prototype, "unstable_exists")
			.mockResolvedValue("/file.bin");

		const request = new IncomingRequest("http://example.com/file.bin");
		const response = await SELF.fetch(request);

		expect(response.status).toBe(200);
		expect(outerExists).not.toBeCalled();
		expect(innerExists).toBeCalledTimes(1);
		expect(getAssetWithMetadataFromKV).toBeCalledTimes(1);
		expect(getAssetWithMetadataFromKV).toBeCalledWith(undefined, "/file.bin");
	});
});
