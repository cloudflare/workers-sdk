import http from "node:http";
import { beforeEach, vi } from "vitest";
import type { Request } from "undici";

/**
 * Setup a mock HTTP server that can be triggered directly without interacting with any network.
 *
 * The mock mirrors production semantics for `server.close()`: its callback only
 * fires once `res.end()` has been observed. A code path that forgets to send a
 * response cannot rely on `server.close()` to clean up — exactly as in
 * production — and tests for such code paths will fail at the vitest test
 * timeout rather than passing by accident.
 *
 * @returns a `fetch`-like function that will trigger the mock server to handle the request.
 */
export function mockHttpServer() {
	let listener: http.RequestListener;
	let pendingCloseCallback: ((err?: Error) => void) | undefined;
	let responseEnded = false;

	beforeEach(() => {
		pendingCloseCallback = undefined;
		responseEnded = false;

		vi.spyOn(http, "createServer").mockImplementation((...args: unknown[]) => {
			listener = args.pop() as http.RequestListener;
			return {
				listen: vi.fn(),
				close(callback?: (err?: Error) => void) {
					if (responseEnded) {
						callback?.();
					} else {
						pendingCloseCallback = callback;
					}
					return this;
				},
				// The OAuth callback server registers an `error` listener so it
				// can surface `EADDRINUSE` cleanly. The mock server never emits
				// errors, so these are no-ops.
				on: vi.fn().mockReturnThis(),
				once: vi.fn().mockReturnThis(),
			} as unknown as http.Server;
		});
	});

	return async (req: Request) => {
		const resp = new http.ServerResponse(
			// If you squint you can just about see that an `IncomingMessages` is like a `Request`!
			req as unknown as http.IncomingMessage
		);

		// The listener may attach a callback to the response by calling `resp.end(callback)`.
		// We capture that so we can trigger it once the listener has finished its async work,
		// and then fire any pending `server.close()` callback (mirroring production semantics
		// where `server.close()` only fires once all open connections have ended).
		const endSpy = vi.spyOn(resp, "end");

		// The `await` here is important to allow the listener to complete its async work before
		// we end the response.
		await listener(req as unknown as http.IncomingMessage, resp);

		if (endSpy.mock.calls.length > 0) {
			// Invoke the optional callback passed to `res.end()` (if any).
			const lastCall = endSpy.mock.calls[endSpy.mock.calls.length - 1];
			const lastArg = lastCall[lastCall.length - 1];
			if (typeof lastArg === "function") {
				(lastArg as () => void)();
			}
			// Mark the response as ended and fire the pending `server.close()` callback,
			// if any. The close callback may have been registered synchronously by the
			// `res.end()` callback above (e.g. via `finish()` in `getOauthToken`), so we
			// read it after invoking that callback.
			responseEnded = true;
			const cb = pendingCloseCallback;
			pendingCloseCallback = undefined;
			cb?.();
		}
		// If `res.end()` was never called, this mimics production: `server.close()`'s
		// callback never fires, and the caller will time out. Tests that hit this path
		// will fail at the vitest test timeout.

		return resp;
	};
}
