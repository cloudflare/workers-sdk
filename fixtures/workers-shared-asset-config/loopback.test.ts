import Worker, {
	AssetWorkerInner,
} from "@cloudflare/workers-shared/asset-worker";
import { normalizeConfiguration } from "@cloudflare/workers-shared/asset-worker/src/configuration";
import { getAssetWithMetadataFromKV } from "@cloudflare/workers-shared/asset-worker/src/utils/kv";
import { setupSentry } from "@cloudflare/workers-shared/utils/sentry";
import { SELF } from "cloudflare:test";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import type { AssetMetadata } from "@cloudflare/workers-shared/asset-worker/src/utils/kv";

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

vi.mock("@cloudflare/workers-shared/asset-worker/src/utils/kv.ts");
vi.mock("@cloudflare/workers-shared/asset-worker/src/configuration");
vi.mock("@cloudflare/workers-shared/utils/sentry");

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

		vi.mocked(setupSentry).mockReturnValue(undefined);
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

describe("[Asset Worker] observability", () => {
	const mockCaptureException = vi.fn();
	const mockEnterSpan = vi.fn((_name: string, fn: () => unknown) => fn());
	const mockRunWithSpanContext = vi.fn((_ctx: unknown, fn: () => unknown) =>
		fn()
	);

	/**
	 * Builds mock env/ctx and instantiates the outer entrypoint directly.
	 * This bypasses SELF (which doesn't support RPC in vitest-pool-workers)
	 * and lets us call outer RPC methods directly.
	 */
	function buildMocks(innerOverrides?: Record<string, unknown>) {
		const env = {
			JAEGER: {
				enterSpan: mockEnterSpan,
				runWithSpanContext: mockRunWithSpanContext,
				getSpanContext: () => ({
					traceId: "test-trace",
					spanId: "test-span",
					parentSpanId: null,
					traceFlags: 0,
				}),
				traceId: "test-trace",
				spanId: "test-span",
				parentSpanId: null,
				cfTraceIdHeader: null,
			},
			SENTRY_DSN: "https://test@sentry.io/123",
			SENTRY_ACCESS_CLIENT_ID: "test-client-id",
			SENTRY_ACCESS_CLIENT_SECRET: "test-client-secret",
			CONFIG: {},
		} as unknown as ConstructorParameters<typeof Worker>[1];

		const mockCtx = {
			waitUntil: () => {},
			passThroughOnException: () => {},
			exports: {} as unknown,
		};

		mockCtx.exports = {
			AssetWorkerInner: ({ props }: { props: unknown }) => {
				const innerCtx = { ...mockCtx, props };
				const inner = new AssetWorkerInner(
					innerCtx as unknown as ExecutionContext,
					env
				);
				if (innerOverrides) {
					for (const [key, value] of Object.entries(innerOverrides)) {
						(inner as Record<string, unknown>)[key] = value;
					}
				}
				return inner;
			},
		};

		const outer = new Worker(mockCtx as unknown as ExecutionContext, env);

		return { outer, env, ctx: mockCtx };
	}

	beforeEach(() => {
		mockCaptureException.mockClear();
		mockEnterSpan.mockClear();
		mockRunWithSpanContext.mockClear();
		vi.mocked(setupSentry).mockClear();
		vi.mocked(setupSentry).mockReturnValue({
			captureException: mockCaptureException,
			setContext: vi.fn(),
		} as unknown as ReturnType<typeof setupSentry>);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("reports errors to Sentry and re-throws when an outer RPC method fails", async ({
		expect,
	}) => {
		const testError = new Error("canFetch failed");
		const { outer } = buildMocks({
			unstable_canFetch: () => Promise.reject(testError),
		});

		const request = new IncomingRequest("http://example.com/test");
		await expect(outer.unstable_canFetch(request)).rejects.toThrow(
			"canFetch failed"
		);

		expect(setupSentry).toHaveBeenCalled();
		expect(mockCaptureException).toHaveBeenCalledWith(testError);
	});

	it("propagates trace context to inner entrypoint via runWithSpanContext", async ({
		expect,
	}) => {
		// Don't override the inner method -- let the real AssetWorkerInner.unstable_exists
		// run so it calls env.JAEGER.runWithSpanContext with the trace context
		const { outer } = buildMocks();

		await outer.unstable_exists("/test").catch(() => {
			// The real implementation may throw due to missing ASSETS_MANIFEST etc.
			// We only care that runWithSpanContext was called before the error
		});

		expect(mockRunWithSpanContext).toHaveBeenCalled();
	});

	it("skips Sentry when no request is provided to RPC methods", async ({
		expect,
	}) => {
		const testError = new Error("exists failed");
		const { outer } = buildMocks({
			unstable_exists: () => Promise.reject(testError),
		});

		await expect(outer.unstable_exists("/test")).rejects.toThrow(
			"exists failed"
		);

		expect(setupSentry).not.toHaveBeenCalled();
		expect(mockCaptureException).not.toHaveBeenCalled();
	});

	it("initializes Sentry when request is provided to RPC methods", async ({
		expect,
	}) => {
		const testError = new Error("getByETag failed");
		const { outer } = buildMocks({
			unstable_getByETag: () => Promise.reject(testError),
		});

		const request = new IncomingRequest("http://example.com/test");
		await expect(outer.unstable_getByETag("etag", request)).rejects.toThrow(
			"getByETag failed"
		);

		expect(setupSentry).toHaveBeenCalled();
		expect(mockCaptureException).toHaveBeenCalledWith(testError);
	});
});
