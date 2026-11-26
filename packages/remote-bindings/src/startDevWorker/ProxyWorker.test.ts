import { once } from "node:events";
import { createServer } from "node:http";
import { newWebSocketRpcSession } from "capnweb";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import { it, onTestFinished, vi } from "vitest";
import { WebSocketServer } from "ws";
import { initLogger } from "../logger";
import { ProxyController } from "./ProxyController";
import { createDeferred } from "./utils";
import type { ErrorEvent } from "./events";
import type { StartDevWorkerOptions } from "./types";
import type { RemoteProxyConnectionString } from "miniflare";
import type {
	IncomingMessage,
	RequestListener,
	ServerResponse,
} from "node:http";
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
 * @param onRequestConnection Starts the remote connection when a request arrives.
 * @returns The proxy, its error listener, and a function to point it at a preview.
 */
async function startProxy(
	onPreviewRequest: RequestListener,
	onRequestConnection = vi.fn()
) {
	const preview = createServer(onPreviewRequest);
	preview.listen(0, "127.0.0.1");
	await once(preview, "listening");
	onTestFinished(() => {
		preview.closeAllConnections();
		preview.close();
	});
	const { port } = preview.address() as AddressInfo;

	const onError = vi.fn<(event: ErrorEvent) => void>();
	const onPreviewTokenExpired = vi.fn();
	const controller = new ProxyController(
		onError,
		onPreviewTokenExpired,
		onRequestConnection
	);
	onTestFinished(() => controller.teardown());
	controller.start(config);
	const { proxyWorker, url } = await controller.ready.promise;
	controller.pause(config);
	await controller.runtimeMessageMutex.drained();

	// Remote previews keep the same host across reloads; only the token changes.
	function play(previewToken: string, refreshAt?: number) {
		controller.play({
			type: "reloadComplete",
			config,
			bundle: {
				path: "proxy-worker.js",
				entrypointSource: config.entrypointSource,
				type: "esm",
				modules: [],
			},
			proxyData: {
				refreshAt,
				userWorkerUrl: {
					protocol: "http:",
					hostname: "127.0.0.1",
					port: String(port),
				},
				headers: { "cf-workers-preview-token": previewToken },
			},
		});
		return controller.runtimeMessageMutex.drained();
	}
	return {
		proxyWorker,
		url,
		onError,
		onPreviewTokenExpired,
		play,
		controller,
		preview,
	};
}

it.for(["current", "paused", "replaced", "failed"] as const)(
	"handles expiry notifications only from the current preview: %s",
	async (state, { expect }) => {
		const oldResponse = createDeferred<ServerResponse>();
		const { proxyWorker, play, controller, onPreviewTokenExpired } =
			await startProxy((_request, response) => oldResponse.resolve(response));
		const onMessage = vi.spyOn(controller, "onProxyWorkerMessage");
		await play("old-preview");
		const pending = proxyWorker.dispatchFetch("http://localhost/");
		const response = await oldResponse.promise;
		if (state === "paused") {
			controller.pause(config);
			await controller.runtimeMessageMutex.drained();
		} else if (state === "replaced") {
			await play("new-preview");
		} else if (state === "failed") {
			controller.connectionFailed("Login cancelled");
			await controller.runtimeMessageMutex.drained();
		}
		response.writeHead(400).end("error code: 1031");
		expect(await (await pending).text()).toBe("error code: 1031");
		await vi.waitFor(() =>
			expect(onMessage).toHaveBeenCalledWith(
				expect.objectContaining({ type: "previewTokenExpired" })
			)
		);
		expect(onPreviewTokenExpired).toHaveBeenCalledTimes(
			state === "current" ? 1 : 0
		);
	}
);

it("refreshes an aging preview on the next binding request without forwarding to the old preview", async ({
	expect,
}) => {
	const requestConnection = vi.fn();
	const { proxyWorker, play } = await startProxy(
		(request, response) =>
			response.end(request.headers["cf-workers-preview-token"]),
		requestConnection
	);
	await play("old-preview", Date.now() - 1);
	expect(requestConnection).not.toHaveBeenCalled();
	const pending = proxyWorker.dispatchFetch("http://localhost/");
	await vi.waitFor(() => expect(requestConnection).toHaveBeenCalledOnce());
	await play("new-preview", Date.now() + 60_000);
	expect(await (await pending).text()).toBe("new-preview");
});

it("queues concurrent binding requests behind one login and forwards them after it succeeds", async ({
	expect,
}) => {
	const requestConnection = vi.fn();
	const { proxyWorker, play } = await startProxy(async (request, response) => {
		const chunks = [];
		for await (const chunk of request) {
			chunks.push(chunk);
		}
		response.end(`${request.method}: ${Buffer.concat(chunks).toString()}`);
	}, requestConnection);
	expect(requestConnection).not.toHaveBeenCalled();
	const pending = ["one", "two"].map((body) =>
		proxyWorker.dispatchFetch("http://localhost/", { method: "POST", body })
	);
	await vi.waitFor(() => expect(requestConnection).toHaveBeenCalledOnce());
	await play("signed-in");
	expect(
		await Promise.all(pending.map(async (response) => (await response).text()))
	).toEqual(["POST: one", "POST: two"]);
	expect(
		await (await proxyWorker.dispatchFetch("http://localhost/")).text()
	).toBe("GET: ");
	expect(requestConnection).toHaveBeenCalledOnce();
});

it("queues an RPC WebSocket upgrade until login succeeds", async ({
	expect,
}) => {
	const requestConnection = vi.fn();
	const { proxyWorker, play, preview } = await startProxy(
		(_request, response) => response.end(),
		requestConnection
	);
	const wsServer = new WebSocketServer({ noServer: true });
	onTestFinished(() => {
		for (const client of wsServer.clients) {
			client.terminate();
		}
		wsServer.close();
	});
	preview.on("upgrade", (request, socket, head) => {
		wsServer.handleUpgrade(request, socket, head, (ws) => {
			ws.on("message", (data, isBinary) => ws.send(data, { binary: isBinary }));
		});
	});
	const pending = proxyWorker.dispatchFetch("http://localhost/", {
		headers: { Upgrade: "websocket" },
	});
	await vi.waitFor(() => expect(requestConnection).toHaveBeenCalledOnce());
	await play("signed-in");
	const response = await pending;
	expect(response.status).toBe(101);
	const ws = response.webSocket;
	if (!ws) {
		throw new Error("Expected an RPC WebSocket upgrade");
	}
	ws.accept();
	const message = new Promise((resolve) =>
		ws.addEventListener("message", (event) => resolve(event.data), {
			once: true,
		})
	);
	ws.send("rpc-message");
	expect(await message).toBe("rpc-message");
	ws.close();
});

it("connects a lazy session when Miniflare needs Hyperdrive credentials at startup", async ({
	expect,
}) => {
	const credentials =
		"postgres://remote-user:remote-password@hyperdrive.local:5432/remote-db";
	const requestConnection = vi.fn();
	const { play, preview, url } = await startProxy(
		(_request, response) => response.end(),
		requestConnection
	);
	const wsServer = new WebSocketServer({ noServer: true });
	onTestFinished(() => {
		for (const client of wsServer.clients) {
			client.terminate();
		}
		wsServer.close();
	});
	preview.on("upgrade", (request, socket, head) => {
		wsServer.handleUpgrade(request, socket, head, (websocket) => {
			newWebSocketRpcSession(websocket as unknown as WebSocket, {
				getConnectionString: () => credentials,
			});
		});
	});
	expect(requestConnection).not.toHaveBeenCalled();
	const mf = new Miniflare(
		convertV4MiniflareOptions({
			workers: [
				{
					name: "worker",
					compatibilityDate: "2026-01-01",
					modules: true,
					script: "export default {};",
					hyperdrives: {
						DB: {
							id: "db",
							remoteProxyConnectionString: url as RemoteProxyConnectionString,
						},
					},
				},
			],
		})
	);
	onTestFinished(() => mf.dispose());
	await vi.waitFor(() => expect(requestConnection).toHaveBeenCalledOnce());
	await play("signed-in");
	await mf.ready;
	const { DB } = await mf.getBindings();
	expect(DB).toMatchObject({
		host: "127.0.0.1",
		user: "remote-user",
		password: "remote-password",
		database: "remote-db",
	});
});

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
