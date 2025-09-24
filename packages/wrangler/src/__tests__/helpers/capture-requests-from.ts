import { http } from "msw";
import { msw } from "./msw";
import type { HttpHandler } from "msw";

/**
 * Sets up an msw http handler that captures each incoming request context.
 * You can use this to inspect each intercepted request and make assertions about them.
 * @param handler an msw http handler, i.e. `http.get(...)`.
 * @returns an object that contains an array of captured requests.
 * @example
 *   const mockGetScripts = captureRequestsFrom(
 *     http.get(
 *       `*\/accounts/:accountId/workers/scripts`,
 *       (ctx) => HttpResponse.json({})
 *     )
 *   );
 *
 *   // -- inside a test case --
 *   const getScripts = mockGetScripts();
 *
 *   await runWrangler(...);
 *
 *   // make an assertion on the first request...
 *   await expect(getScripts.requests[0].json()).resolves.toEqual(...);
 *
 *   // and the next one too!
 *   await expect(getScripts.requests[1].json()).resolves.toHaveProperty(...);
 */
export function captureRequestsFrom(handler: HttpHandler) {
	return () => {
		const capturedRequests = { requests: [] as Request[] };
		msw.use(
			http.all("*", async (ctx) => {
				if (await handler.test(ctx)) {
					capturedRequests.requests.push(ctx.request);
					const result = await handler.run(ctx);
					return result?.response;
				}
			})
		);
		return capturedRequests;
	};
}
