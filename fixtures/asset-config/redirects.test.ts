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

describe("[Asset Worker] `test location rewrite`", () => {
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

	it("returns 404 for non matched encoded url", async () => {
		const files = ["/christmas/starts/november/first.html"];
		const requestPath = "/%2f%2fbad.example.com%2f";

		existsMock(new Set(files));
		const request = new IncomingRequest(BASE_URL + requestPath);
		let response = await SELF.fetch(request, { redirect: "manual" });
		expect(response.status).toBe(404);
	});

	it("returns 200 for matched non encoded url", async () => {
		const files = ["/you/lost/the/game.bin"];
		const requestPath = "/you/lost/the/game.bin";

		existsMock(new Set(files));
		const request = new IncomingRequest(BASE_URL + requestPath);
		let response = await SELF.fetch(request, { redirect: "manual" });
		expect(response.status).toBe(200);
	});

	it("returns redirect for matched encoded url", async () => {
		const files = ["/awesome/file.bin"];
		const requestPath = "/awesome/file%2ebin";
		const finalPath = "/awesome/file.bin";

		existsMock(new Set(files));
		const request = new IncomingRequest(BASE_URL + requestPath);
		let response = await SELF.fetch(request, { redirect: "manual" });
		expect(response.status).toBe(307);
		expect(response.headers.get("location")).toBe(finalPath);
	});

	it("returns 200 for matched non encoded url", async () => {
		const files = ["/mylittlepony.png"];
		const requestPath = "/mylittlepony.png";

		existsMock(new Set(files));
		const request = new IncomingRequest(BASE_URL + requestPath);
		let response = await SELF.fetch(request, { redirect: "manual" });
		expect(response.status).toBe(200);
	});
});
