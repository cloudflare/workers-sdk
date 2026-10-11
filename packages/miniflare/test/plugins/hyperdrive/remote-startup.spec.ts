import assert from "node:assert";
import { once } from "node:events";
import net from "node:net";
import { newWebSocketRpcSession } from "capnweb";
import { test, vi } from "vitest";
import { WebSocketServer } from "ws";
import { HyperdriveProxyController } from "../../../src/plugins/hyperdrive/hyperdrive-proxy";

test.for([undefined, "hyperdrive-startup-trace"])(
	"recovers from a failed startup connection with CF_TRACE_ID=%s",
	async (traceId, { expect }) => {
		vi.stubEnv("CF_TRACE_ID", traceId);
		const edge = new WebSocketServer({ port: 0, host: "127.0.0.1" });
		const controller = new HyperdriveProxyController();
		const receivedTraceIds: (string | string[] | undefined)[] = [];
		const connectionString =
			"mysql://user:password@hyperdrive.local:3306/database";
		let client: net.Socket | undefined;
		try {
			await once(edge, "listening");
			const address = edge.address();
			assert(address !== null && typeof address !== "string");
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
				remoteProxyConnectionString: new URL(
					`http://127.0.0.1:${address.port}`
				),
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
			for (const socket of edge.clients) {
				socket.terminate();
			}
			await new Promise<void>((resolve, reject) =>
				edge.close((error) => (error ? reject(error) : resolve()))
			);
			vi.unstubAllEnvs();
		}
	}
);
