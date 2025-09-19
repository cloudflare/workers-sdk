import assert from "node:assert";
import { http } from "msw";
import { msw } from "./msw";
import type { HttpHandler } from "msw";

/**
 * Sets up an msw http handler and returns an async generator that yields each incoming request context.
 * You can use this to inspect each intercepted request and make assertions about them.
 * @param handler an msw http handler, i.e. `http.get(...)`.
 * @returns a generator that yields a context object containing the request and other info.
 * @example
 *   const mockGetScripts = yieldRequestsFrom(
 *     http.get(
 *       `*\/accounts/:accountId/workers/scripts`,
 *       (ctx) => HttpResponse.json({})
 *     )
 *   );
 *
 *   // -- inside a test case --
 *   const getScripts = mockGetScripts();
 *
 *   // don't await this yet or you'll miss all the requests!
 *   const done = runWrangler(...);
 *
 *   // wait for the first request...
 *   const {value: request} = await getScripts.next();
 *   await expect(ctx.request.json()).resolves.toEqual(...);
 *
 *   // and the next one too!
 *   const {value: nextRequest} = await getScripts.next();
 *   await expect(nextRequest.json()).resolves.toHaveProperty(...);
 *
 *   // finally, be sure to wait for the run command to finish.
 *   await done;
 */
export function yieldRequestsFrom(handler: HttpHandler) {
	return () => {
		let resolve: (value: Request) => void = () => {};

		let promise = new Promise<Request>((_resolve) => {
			resolve = _resolve;
		});

		const requests = [promise];

		const parentHandler = http.all("*", async (ctx) => {
			if (await handler.test(ctx)) {
				resolve(ctx.request);
				promise = new Promise<Request>((_resolve) => {
					resolve = _resolve;
				});
				requests.push(promise);
				const result = await handler.run(ctx);
				return result?.response;
			}
		});

		async function* gen() {
			while (true) {
				const promise = requests.shift();
				assert(promise);
				const ctx = await promise;
				yield ctx;
			}

			return promise;
		}

		const generator = gen();

		msw.use(parentHandler);
		return generator;
	};
}
