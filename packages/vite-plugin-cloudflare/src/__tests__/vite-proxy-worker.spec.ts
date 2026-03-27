import { beforeEach, describe, test, vi } from "vitest";

class MockWorkerEntrypoint<Env> {
	readonly env: Env;

	constructor(_: unknown, env: Env) {
		this.env = env;
	}
}

vi.mock("cloudflare:workers", () => ({
	WorkerEntrypoint: MockWorkerEntrypoint,
}));

const { default: ViteProxyWorker } = await import(
	"../workers/vite-proxy-worker/index"
);

describe("ViteProxyWorker", () => {
	const entryFetch = vi.fn<(request: Request) => Promise<Response>>();
	const middlewareFetch = vi.fn<(request: Request) => Promise<Response>>();

	beforeEach(() => {
		entryFetch.mockReset();
		middlewareFetch.mockReset();
		entryFetch.mockResolvedValue(new Response("entry worker"));
		middlewareFetch.mockResolvedValue(new Response("vite middleware"));
	});

	test("forwards HTTP requests to Vite middleware", async ({ expect }) => {
		const worker = new ViteProxyWorker(
			{} as never,
			{
				ENTRY_USER_WORKER: { fetch: entryFetch },
				__VITE_MIDDLEWARE__: { fetch: middlewareFetch },
			} as never
		);

		const response = await worker.fetch(new Request("http://example.com"));

		expect(await response.text()).toBe("vite middleware");
		expect(middlewareFetch).toHaveBeenCalledOnce();
		expect(entryFetch).not.toHaveBeenCalled();
	});

	test("forwards WebSocket upgrades to the entry user worker", async ({
		expect,
	}) => {
		const worker = new ViteProxyWorker(
			{} as never,
			{
				ENTRY_USER_WORKER: { fetch: entryFetch },
				__VITE_MIDDLEWARE__: { fetch: middlewareFetch },
			} as never
		);

		const response = await worker.fetch(
			new Request("http://example.com/websocket", {
				headers: { Upgrade: "websocket" },
			})
		);

		expect(await response.text()).toBe("entry worker");
		expect(entryFetch).toHaveBeenCalledOnce();
		expect(middlewareFetch).not.toHaveBeenCalled();
	});
});
