import { once } from "node:events";
import { createServer } from "node:http";
import { it, onTestFinished, vi } from "vitest";
import { initLogger } from "../logger";
import { ProxyController } from "./ProxyController";
import { createDeferred } from "./utils";
import type { ErrorEvent } from "./events";
import type { StartDevWorkerOptions } from "./types";
import type { IncomingMessage, RequestListener } from "node:http";
import type { AddressInfo } from "node:net";

initLogger({
	loggerLevel: "none",
	debug: vi.fn(),
	log: vi.fn(),
	info: vi.fn(),
	warn: vi.fn(),
	error: vi.fn(),
	console: vi.fn(),
});

const config: StartDevWorkerOptions = {
	name: "remote-bindings-proxy",
	cliDisplayName: "Wrangler",
	entrypointSource: "export default {};",
	bindings: {},
	compatibilityDate: "2026-07-17",
	compatibilityFlags: [],
	complianceRegion: undefined,
	auth: () => ({
		accountId: "account-id",
		apiToken: { apiToken: "api-token" },
	}),
	server: { hostname: "127.0.0.1", port: 0, secure: false },
};

/**
 * Starts the ProxyWorker in front of a local server that stands in for the
 * remote preview.
 *
 * @param onPreviewRequest Handles requests that reach the preview.
 * @returns The proxy, its error listener, and a function to point it at a preview.
 */
async function startProxy(onPreviewRequest: RequestListener) {
	const preview = createServer(onPreviewRequest);
	preview.listen(0, "127.0.0.1");
	await once(preview, "listening");
	onTestFinished(() => {
		preview.closeAllConnections();
		preview.close();
	});
	const { port } = preview.address() as AddressInfo;

	const onError = vi.fn<(event: ErrorEvent) => void>();
	const controller = new ProxyController(onError, vi.fn());
	onTestFinished(() => controller.teardown());
	controller.start(config);
	const { proxyWorker } = await controller.ready.promise;

	// Remote previews keep the same host across reloads; only the token changes.
	function play(previewToken: string) {
		return controller.sendMessageToProxyWorker({
			type: "play",
			proxyData: {
				userWorkerUrl: {
					protocol: "http:",
					hostname: "127.0.0.1",
					port: String(port),
				},
				headers: { "cf-workers-preview-token": previewToken },
			},
		});
	}
	return { proxyWorker, onError, play };
}

it("fails remote binding requests whose connection to the current preview fails", async ({
	expect,
}) => {
	const { proxyWorker, onError, play } = await startProxy((request) =>
		request.socket.destroy()
	);
	await play("current-preview");

	const response = await proxyWorker.dispatchFetch(
		"http://localhost/?MF-Binding=KV"
	);

	expect(response.status).toBe(500);
	await vi.waitFor(() =>
		expect(onError).toHaveBeenCalledWith(
			expect.objectContaining({ reason: "Error inside ProxyWorker" })
		)
	);
});

it("retries requests that fail after a reload against the new preview", async ({
	expect,
}) => {
	const oldPreviewRequest = createDeferred<IncomingMessage>();
	const { proxyWorker, onError, play } = await startProxy(
		(request, response) => {
			const token = request.headers["cf-workers-preview-token"];
			if (token === "old-preview") {
				oldPreviewRequest.resolve(request);
			} else {
				response.end(`served by ${token}`);
			}
		}
	);
	await play("old-preview");
	const response = proxyWorker.dispatchFetch("http://localhost/");
	const request = await oldPreviewRequest.promise;
	// The reload completes before the old preview's connection fails.
	await play("new-preview");
	request.socket.destroy();

	expect(await (await response).text()).toBe("served by new-preview");
	expect(onError).not.toHaveBeenCalled();
});
