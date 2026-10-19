import { Response } from "miniflare";
import { describe, it, vi } from "vitest";
import { ProxyController } from "./ProxyController";
import type { ErrorEvent, ReadyEvent, ReloadCompleteEvent } from "./events";

// Only the Miniflare instance ProxyController talks to is faked, so its own
// send, retry and error reporting run for real.
function controllerWith(dispatchFetch: () => Promise<Response>) {
	const onError = vi.fn<(event: ErrorEvent) => void>();
	const controller = new ProxyController(onError, () => {});
	const proxyWorker = {
		ready: Promise.resolve(new URL("http://127.0.0.1:8787/")),
		dispatchFetch: vi.fn(dispatchFetch),
	};
	controller.ready.resolve({
		type: "ready",
		proxyWorker,
		url: new URL("http://127.0.0.1:8787/"),
	} as unknown as ReadyEvent);
	return { controller, onError, proxyWorker };
}

const reloadComplete = {
	type: "reloadComplete",
	config: {},
	bundle: {},
	proxyData: {},
} as unknown as ReloadCompleteEvent;

describe("ProxyController.latestReloadCompleteMessage", () => {
	it("resolves true once the ProxyWorker receives play", async ({ expect }) => {
		const { controller, onError, proxyWorker } = controllerWith(async () => {
			return new Response(null, { status: 204 });
		});

		controller.play(reloadComplete);

		expect(await controller.latestReloadCompleteMessage).toBe(true);
		expect(proxyWorker.dispatchFetch).toHaveBeenCalledTimes(1);
		expect(onError).not.toHaveBeenCalled();
	});

	// Under Bun, Miniflare's `dispatchFetch()` sends the request to the literal
	// `http://dummy/...` URL, because Bun's `fetch()` ignores the undici
	// `dispatcher` that rewrites it, and the lookup fails.
	it("resolves false and reports the error once every retry fails", async ({
		expect,
	}) => {
		const { controller, onError, proxyWorker } = controllerWith(async () => {
			throw new Error("getaddrinfo ENOTFOUND dummy");
		});

		controller.play(reloadComplete);

		expect(await controller.latestReloadCompleteMessage).toBe(false);
		expect(proxyWorker.dispatchFetch).toHaveBeenCalledTimes(4);
		expect(onError).toHaveBeenCalledTimes(1);
		expect(onError).toHaveBeenCalledWith(
			expect.objectContaining({
				reason: expect.stringContaining(
					"Failed to send message to ProxyWorker"
				),
			})
		);
	});
});
