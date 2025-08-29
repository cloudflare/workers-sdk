import Worker from "@cloudflare/workers-shared/asset-worker";
import { normalizeConfiguration } from "@cloudflare/workers-shared/asset-worker/src/configuration";
import { getAssetWithMetadataFromKV } from "@cloudflare/workers-shared/asset-worker/src/utils/kv";
import { SELF } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

describe("[Asset Worker] `test location rewrite`", () => {
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
