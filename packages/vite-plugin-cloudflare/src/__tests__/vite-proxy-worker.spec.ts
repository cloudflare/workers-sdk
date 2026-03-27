import { describe, expect, test, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({
	WorkerEntrypoint: class WorkerEntrypoint<Env> {
		constructor(
			protected readonly ctx: ExecutionContext,
			protected readonly env: Env
		) {}
	},
}));

describe("ViteProxyWorker", () => {
	test("forwards WebSocket upgrades to the entry worker", async () => {
		const { default: ViteProxyWorker } = await import(
			"../workers/vite-proxy-worker/index"
		);
		const entryResponse = new Response(null);
		const env = {
			ENTRY_USER_WORKER: {
				fetch: vi.fn().mockResolvedValue(entryResponse),
				tail: vi.fn(),
			},
			__VITE_MIDDLEWARE__: {
				fetch: vi.fn(),
			},
		};
		const worker = new ViteProxyWorker(
			{} as ExecutionContext,
			env as ConstructorParameters<typeof ViteProxyWorker>[1]
		);
		const request = new Request("http://example.com/websocket", {
			headers: { Upgrade: "websocket" },
		});

		const response = await worker.fetch(request);

		expect(env.ENTRY_USER_WORKER.fetch).toHaveBeenCalledWith(request);
		expect(env.__VITE_MIDDLEWARE__.fetch).not.toHaveBeenCalled();
		expect(response).toBe(entryResponse);
	});

	test("forwards non-WebSocket requests to Vite middleware", async () => {
		const { default: ViteProxyWorker } = await import(
			"../workers/vite-proxy-worker/index"
		);
		const middlewareResponse = new Response("ok");
		const env = {
			ENTRY_USER_WORKER: {
				fetch: vi.fn(),
				tail: vi.fn(),
			},
			__VITE_MIDDLEWARE__: {
				fetch: vi.fn().mockResolvedValue(middlewareResponse),
			},
		};
		const worker = new ViteProxyWorker(
			{} as ExecutionContext,
			env as ConstructorParameters<typeof ViteProxyWorker>[1]
		);
		const request = new Request("http://example.com/");

		const response = await worker.fetch(request);

		expect(env.__VITE_MIDDLEWARE__.fetch).toHaveBeenCalledWith(request);
		expect(env.ENTRY_USER_WORKER.fetch).not.toHaveBeenCalled();
		expect(response).toBe(middlewareResponse);
	});
});
