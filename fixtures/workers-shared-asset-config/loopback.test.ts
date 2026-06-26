import Worker, {
	AssetWorkerInner,
	AssetWorkerOuter,
} from "@cloudflare/workers-shared/asset-worker";
import { normalizeConfiguration } from "@cloudflare/workers-shared/asset-worker/src/configuration";
import { getAssetWithMetadataFromKV } from "@cloudflare/workers-shared/asset-worker/src/utils/kv";
import { SELF, createExecutionContext } from "cloudflare:test";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import type { Env } from "@cloudflare/workers-shared/asset-worker";
import type { AssetMetadata } from "@cloudflare/workers-shared/asset-worker/src/utils/kv";

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

vi.mock("@cloudflare/workers-shared/asset-worker/src/utils/kv.ts");
vi.mock("@cloudflare/workers-shared/asset-worker/src/configuration");

describe("[Asset Worker] entrypoints", () => {
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

	it("uses the inner entrypoint as the default export", ({ expect }) => {
		expect(Worker).toBe(AssetWorkerInner);
	});

	it("routes directly through the inner entrypoint", async ({ expect }) => {
		const innerExists = vi
			.spyOn(AssetWorkerInner.prototype, "unstable_exists")
			.mockResolvedValue("/file.bin");

		const request = new IncomingRequest("http://example.com/file.bin");
		const response = await SELF.fetch(request);

		expect(response.status).toBe(200);
		expect(innerExists).toBeCalledTimes(1);
		expect(getAssetWithMetadataFromKV).toBeCalledTimes(1);
		expect(getAssetWithMetadataFromKV).toBeCalledWith(undefined, "/file.bin");
	});

	it("keeps the outer-to-inner loopback available", async ({ expect }) => {
		const request = new Request("https://example.com");
		const ctx = createExecutionContext();
		const innerFetch = vi.fn(async (_request: Request) => {
			return new Response("inner response");
		});
		const createInnerEntrypoint = vi.fn(() => ({ fetch: innerFetch }));
		Object.defineProperty(ctx, "exports", {
			value: {
				AssetWorkerInner: createInnerEntrypoint,
			},
		});

		const response = await new AssetWorkerOuter(ctx, {} as Env).fetch(request);

		expect(createInnerEntrypoint).toHaveBeenCalledOnce();
		expect(createInnerEntrypoint).toHaveBeenCalledWith({
			props: {
				traceContext: {
					traceId: "test-trace",
					spanId: "test-span",
					parentSpanId: "test-parent-span",
					traceFlags: 0,
				},
			},
		});
		expect(innerFetch).toHaveBeenCalledOnce();
		expect(innerFetch).toHaveBeenCalledWith(request);
		expect(await response.text()).toBe("inner response");
	});
});
