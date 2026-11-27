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
					functionPath: string;
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
			const functionPath = pathname.slice(0, pathname.lastIndexOf("/one"));
			expect(
				middleware.mock.calls.map(([context]) => context.functionPath)
			).toEqual([functionPath, functionPath]);
		}
	);

	it.for([
		{
			routePath: "/",
			mountPath: "/",
			pathname: "///one",
			params: {},
			functionPath: "/",
		},
		{
			routePath: "/proxy/:path*",
			mountPath: "/proxy",
			pathname: "/proxy/https://example.com/file",
			params: { path: ["https:"] },
			functionPath: "/proxy",
		},
	])(
		"preserves existing middleware matches at $pathname",
		async (
			{ routePath, mountPath, pathname, params, functionPath },
			{ expect }
		) => {
			const handler = vi.fn(() => new Response("middleware"));
			vi.stubGlobal("routes", [
				{ routePath, mountPath, modules: [], middlewares: [handler] },
			]);
			const response = await worker.fetch(
				new Request(`https://example.com${pathname}`),
				{ ASSETS: { fetch: vi.fn<typeof fetch>() } },
				{ waitUntil: vi.fn(), passThroughOnException: vi.fn() }
			);

			expect(await response.text()).toBe("middleware");
			expect(handler).toHaveBeenCalledExactlyOnceWith(
				expect.objectContaining({ params, functionPath })
			);
		}
	);

	it.for([
		{
			routePath: "/api/:id",
			mountPath: "/api",
			pathname: "/api/one",
			params: { id: "one" },
		},
		{
			routePath: "/proxy/:path*",
			mountPath: "/proxy",
			pathname: "/proxy/https:%2F%2Fexample.com/file",
			params: { path: ["https:%2F%2Fexample.com", "file"] },
		},
	])(
		"preserves function params and functionPath at $pathname",
		async ({ routePath, mountPath, pathname, params }, { expect }) => {
			const handler = vi.fn(() => new Response("function"));
			vi.stubGlobal("routes", [
				{ routePath, mountPath, modules: [handler], middlewares: [] },
			]);
			const assetFetch = vi.fn<typeof fetch>();
			const request = new Request(`https://example.com${pathname}`);
			const response = await worker.fetch(
				request,
				{ ASSETS: { fetch: assetFetch } },
				{ waitUntil: vi.fn(), passThroughOnException: vi.fn() }
			);

			expect(await response.text()).toBe("function");
			expect(assetFetch).not.toHaveBeenCalled();
			expect(handler).toHaveBeenCalledExactlyOnceWith(
				expect.objectContaining({
					params,
					functionPath: pathname,
					request: expect.objectContaining({ url: request.url }),
				})
			);
		}
	);

	it.for([
		{
			routePath: "/api/:id",
			mountPath: "/api",
			pathname: "/api//one",
		},
		{
			routePath: "/proxy/:path*",
			mountPath: "/proxy",
			pathname: "/proxy/https://example.com/file",
		},
	])(
		"does not normalize function route matching at $pathname",
		async ({ routePath, mountPath, pathname }, { expect }) => {
			const handler = vi.fn(() => new Response("function"));
			vi.stubGlobal("routes", [
				{ routePath, mountPath, modules: [handler], middlewares: [] },
			]);
			vi.stubGlobal("__FALLBACK_SERVICE__", "ASSETS");
			const assetFetch = vi
				.fn<typeof fetch>()
				.mockResolvedValue(new Response("asset fallback"));
			const request = new Request(`https://example.com${pathname}`);
			const response = await worker.fetch(
				request,
				{ ASSETS: { fetch: assetFetch } },
				{ waitUntil: vi.fn(), passThroughOnException: vi.fn() }
			);

			expect(await response.text()).toBe("asset fallback");
			expect(handler).not.toHaveBeenCalled();
			expect(assetFetch).toHaveBeenCalledExactlyOnceWith(request);
		}
	);
});
