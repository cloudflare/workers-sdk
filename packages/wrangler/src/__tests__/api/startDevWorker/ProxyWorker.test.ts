import { afterEach, beforeAll, describe, test, vi } from "vitest";
import { ProxyWorker } from "../../../../templates/startDevWorker/ProxyWorker";

// A dropped internal connection to the UserWorker: `fetch` itself rejects.
// See https://github.com/cloudflare/workers-sdk/issues/16216
describe("ProxyWorker retries on a dropped UserWorker connection", () => {
	// `Headers.getAll` is a workerd extension that Node lacks
	beforeAll(() => {
		(Headers.prototype as unknown as Record<string, unknown>).getAll ??=
			function (this: Headers) {
				return this.getSetCookie();
			};
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	async function run(method: string) {
		const fetchMock = vi
			.fn()
			.mockRejectedValueOnce(new Error("Network connection lost."))
			.mockResolvedValue(new Response("ok"));
		vi.stubGlobal("fetch", fetchMock);
		vi.spyOn(console, "warn").mockImplementation(() => {});

		const controllerFetch = vi.fn().mockResolvedValue(new Response(null));
		const env = {
			PROXY_CONTROLLER: { fetch: controllerFetch },
			PROXY_CONTROLLER_AUTH_SECRET: "secret",
			DURABLE_OBJECT: {},
		};
		const worker = new ProxyWorker({} as never, env as never);
		worker.proxyData = {
			userWorkerUrl: { protocol: "http:", hostname: "127.0.0.1", port: "9999" },
			userWorkerInnerUrlOverrides: {},
			headers: {},
			liveReload: false,
		} as never;

		const res = await worker.fetch(
			new Request("http://localhost:8787/api/stats", { method }) as never
		);
		return { res, fetchMock, controllerFetch };
	}

	test("retries GET (baseline)", async ({ expect }) => {
		const { res, fetchMock } = await run("GET");
		expect(res.status).toBe(200);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	test("retries a bodyless OPTIONS preflight", async ({ expect }) => {
		const { res, fetchMock, controllerFetch } = await run("OPTIONS").catch(
			(e: unknown) => ({
				res: e as Error,
				fetchMock: undefined,
				controllerFetch: undefined,
			})
		);
		expect(res).toBeInstanceOf(Response);
		expect((res as Response).status).toBe(200);
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(controllerFetch).not.toHaveBeenCalled();
	});
});
