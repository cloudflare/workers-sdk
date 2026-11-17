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

	const response = proxyWorker.dispatchFetch("http://localhost/?MF-Binding=KV");

	await vi.waitFor(() =>
		expect(onError).toHaveBeenCalledWith(
			expect.objectContaining({ reason: "Error inside ProxyWorker" })
		)
	);
	expect((await response).status).toBe(500);
});

it("treats failures from a replaced preview on the same host as a reload", async ({
	expect,
}) => {
	const received = createDeferred<IncomingMessage>();
	const { proxyWorker, onError, play } = await startProxy((request) =>
		received.resolve(request)
	);
	await play("old-preview");
	// The proxy doesn't retry POSTs, so it answers as soon as it sees the failure.
	const response = proxyWorker.dispatchFetch(
		"http://localhost/?MF-Binding=KV",
		{ method: "POST", body: "value" }
	);
	const request = await received.promise;
	await play("new-preview");
	request.socket.destroy();

	expect(await (await response).text()).toContain(
		"Your worker restarted mid-request"
	);
	expect(onError).not.toHaveBeenCalled();
});
