import { afterEach, describe, it, vi } from "vitest";
import pagesFunctionsWorker from "../../../pages-functions/src/templates/pages-template-worker";
import wranglerWorker from "../pages-template-worker";

describe.each([
	["@cloudflare/pages-functions", pagesFunctionsWorker],
	["wrangler", wranglerWorker],
] as const)("%s worker routing", (_name, worker) => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it.for([
		"/secure/nested/one",
		"//secure/nested/one",
		"///secure/nested/one",
		"/secure//nested/one",
		"/secure///nested/one",
		"///secure//nested/one",
	])(
		"runs directory middleware before serving assets at %s",
		async (pathname, { expect }) => {
			const middleware = vi.fn(
				({
					request,
					next,
				}: {
					request: Request;
					next: () => Promise<Response>;
				}) => {
					if (new URL(request.url).searchParams.has("allow")) {
						return next();
					}
					return new Response("Access denied", { status: 403 });
				}
			);
			vi.stubGlobal("routes", [
				{
					routePath: "/secure/nested",
					mountPath: "/secure/nested",
					modules: [],
					middlewares: [middleware],
				},
			]);
			vi.stubGlobal("__FALLBACK_SERVICE__", "ASSETS");

			const assetFetch = vi
				.fn<typeof fetch>()
				.mockResolvedValue(new Response("static asset"));
			const env = { ASSETS: { fetch: assetFetch } };
			const context = {
				waitUntil: vi.fn(),
				passThroughOnException: vi.fn(),
			};
			const deniedRequest = new Request(`https://example.com${pathname}`);
			const deniedResponse = await worker.fetch(deniedRequest, env, context);

			expect(deniedResponse.status).toBe(403);
			expect(await deniedResponse.text()).toBe("Access denied");
			expect(assetFetch).not.toHaveBeenCalled();

			const allowedRequest = new Request(
				`https://example.com${pathname}?allow&redirect=https://example.com//target`
			);
			const allowedResponse = await worker.fetch(allowedRequest, env, context);

			expect(allowedResponse.status).toBe(200);
			expect(await allowedResponse.text()).toBe("static asset");
			expect(assetFetch).toHaveBeenCalledExactlyOnceWith(allowedRequest);
			expect(middleware.mock.calls.map(([{ request }]) => request.url)).toEqual(
				[deniedRequest.url, allowedRequest.url]
			);
		}
	);
});
