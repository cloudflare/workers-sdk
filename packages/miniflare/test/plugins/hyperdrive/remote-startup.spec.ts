import { once } from "node:events";
import net from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { newWebSocketRpcSession } from "capnweb";
import { Miniflare } from "miniflare";
import { test, vi } from "vitest";
import { HyperdriveProxyController } from "../../../src/plugins/hyperdrive/hyperdrive-proxy";
import { singleModuleManifest } from "../../test-shared";
import { useRemoteProxyServer } from "./helpers";

test("disposal cancels startup during retry backoff", async ({ expect }) => {
	const { edge, url } = await useRemoteProxyServer();
	const controller = new HyperdriveProxyController();
	const closed = Promise.withResolvers<void>();
	let attempts = 0;
	edge.on("connection", (websocket) => {
		attempts++;
		websocket.once("close", () => closed.resolve());
		newWebSocketRpcSession(websocket as unknown as WebSocket, {
			getConnectionString() {
				throw new Error("retry startup");
			},
		});
	});
	try {
		const starting = controller.createRemoteTcpBridge({
			name: "hyperdrive:0:DB",
			bindingName: "DB",
			bindingId: "db",
			remoteProxyConnectionString: url,
		});
		const rejected = expect(starting).rejects.toMatchObject({
			name: "AbortError",
		});
		await closed.promise;
		await delay(25);
		controller.dispose();
		await rejected;
		await vi.waitFor(() => expect(edge.clients.size).toBe(0));
		await delay(600);
		expect(attempts).toBe(1);
		expect(controller.getRemoteBridgePort("hyperdrive:0:DB")).toBeUndefined();
	} finally {
		controller.dispose();
	}
});

test("Miniflare disposal cancels pending Hyperdrive initialization", async ({
	expect,
}) => {
	const { edge, url } = await useRemoteProxyServer();
	const requested = Promise.withResolvers<void>();
	edge.on("connection", (websocket) => {
		newWebSocketRpcSession(websocket as unknown as WebSocket, {
			getConnectionString() {
				requested.resolve();
				return new Promise<string>(() => {});
			},
		});
	});
	const mf = new Miniflare({
		workers: [
			{
				config: {
					name: "test",
					compatibilityDate: "2026-09-01",
					manifest: singleModuleManifest("export default {}"),
					env: { DB: { type: "hyperdrive", id: "db", dev: { remote: true } } },
				},
				dev: {
					remoteProxyConnectionString: url,
				},
			},
		],
	});
	const ready = expect(mf.ready).rejects.toMatchObject({
		code: "ERR_DISPOSED",
	});
	try {
		await requested.promise;
		await mf.dispose();
		await ready;
		await vi.waitFor(() => expect(edge.clients.size).toBe(0));
	} finally {
		await mf.dispose();
	}
});

test("an early client reset releases its pending socket without breaking the session", async ({
	expect,
}) => {
	const { edge, url } = await useRemoteProxyServer();
	const requested = Promise.withResolvers<void>();
	const release = Promise.withResolvers<void>();
	const aborted = vi.fn();
	let connections = 0;
	edge.on("connection", (websocket) => {
		newWebSocketRpcSession(websocket as unknown as WebSocket, {
			getConnectionString() {
				return "mysql://user:password@hyperdrive.local:3306/database";
			},
			async connect() {
				if (++connections === 1) {
					requested.resolve();
					await release.promise;
					let readableController:
						| ReadableStreamDefaultController<Uint8Array>
						| undefined;
					return {
						readable: new ReadableStream<Uint8Array>({
							start(streamController) {
								readableController = streamController;
							},
						}),
						writable: new WritableStream<Uint8Array>({
							abort() {
								aborted();
								readableController?.close();
							},
						}),
					};
				}
				return {
					readable: new ReadableStream<Uint8Array>({
						start(streamController) {
							streamController.enqueue(new TextEncoder().encode("ready"));
							streamController.close();
						},
					}),
					writable: new WritableStream<Uint8Array>(),
				};
			},
		});
	});
	const controller = new HyperdriveProxyController();
	const createServer = vi.spyOn(net, "createServer");
	const accepted = Promise.withResolvers<net.Socket>();
	let client: net.Socket | undefined;
	let nextClient: net.Socket | undefined;
	try {
		const port = await controller.createRemoteTcpBridge({
			name: "hyperdrive:0:DB",
			bindingName: "DB",
			bindingId: "db",
			remoteProxyConnectionString: url,
		});
		const server = createServer.mock.results[0].value as net.Server;
		server.once("connection", accepted.resolve);
		client = net.connect(port, "127.0.0.1");
		client.on("error", vi.fn());
		await once(client, "connect");
		client.write("hello");
		await requested.promise;
		const acceptedSocket = await accepted.promise;
		const closed = new Promise<void>((resolve) =>
			acceptedSocket.once("close", () => resolve())
		);
		client.resetAndDestroy();
		await closed;
		release.resolve();
		await vi.waitFor(() => expect(aborted).toHaveBeenCalledOnce());
		nextClient = net.connect(port, "127.0.0.1");
		const [chunk] = await once(nextClient, "data");
		expect(chunk.toString()).toBe("ready");
		expect(edge.clients.size).toBe(1);
	} finally {
		release.resolve();
		client?.destroy();
		nextClient?.destroy();
		controller.dispose();
		createServer.mockRestore();
	}
});

test("retries a failed startup connection and forwards CF_TRACE_ID", async ({
	expect,
}) => {
	const traceId = "hyperdrive-startup-trace";
	vi.stubEnv("CF_TRACE_ID", traceId);
	const { edge, url } = await useRemoteProxyServer();
	const controller = new HyperdriveProxyController();
	const receivedTraceIds: (string | string[] | undefined)[] = [];
	const connectionString =
		"mysql://user:password@hyperdrive.local:3306/database";
	let client: net.Socket | undefined;
	try {
		edge.on("connection", (socket, request) => {
			receivedTraceIds.push(request.headers["cf-trace-id"]);
			if (receivedTraceIds.length === 1) {
				socket.terminate();
				return;
			}
			newWebSocketRpcSession(socket as unknown as WebSocket, {
				getConnectionString() {
					return connectionString;
				},
				connect() {
					return {
						readable: new ReadableStream<Uint8Array>({
							start(readableController) {
								readableController.enqueue(new TextEncoder().encode("ready"));
								readableController.close();
							},
						}),
						writable: new WritableStream<Uint8Array>(),
					};
				},
			});
		});
		const bindingName = "hyperdrive:0:DB";
		const port = await controller.createRemoteTcpBridge({
			name: bindingName,
			bindingName: "DB",
			bindingId: "db",
			remoteProxyConnectionString: url,
		});
		expect(controller.getRemoteConnectionString(bindingName)).toBe(
			connectionString
		);
		expect(controller.getRemoteBridgePort(bindingName)).toBe(port);
		client = net.connect(port, "127.0.0.1");
		const [chunk] = await once(client, "data");
		expect(chunk.toString()).toBe("ready");
		expect(receivedTraceIds).toEqual([traceId, traceId]);
		expect(edge.clients.size).toBe(1);
		controller.dispose();
		await vi.waitFor(() => expect(edge.clients.size).toBe(0));
	} finally {
		client?.destroy();
		controller.dispose();
		vi.unstubAllEnvs();
	}
});
