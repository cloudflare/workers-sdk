import assert from "node:assert";
import { once } from "node:events";
import net from "node:net";
import { newWebSocketRpcSession } from "capnweb";
import { test, vi } from "vitest";
import { WebSocketServer } from "ws";
import { HyperdriveProxyController } from "../../../src/plugins/hyperdrive/hyperdrive-proxy";

test.for([
	"active",
	"removed",
	"changed",
	"aborted",
	"restored",
	"reconnected",
	"ended",
])(
	"disposes live connections from a %s remote listener",
	async (state, { expect }) => {
		const edge = new WebSocketServer({ port: 0, host: "127.0.0.1" });
		await once(edge, "listening");
		const address = edge.address();
		assert(address !== null && typeof address !== "string");
		edge.on("connection", (socket) => {
			newWebSocketRpcSession(socket as unknown as WebSocket, {
				getConnectionString() {
					return "mysql://user:password@hyperdrive.local:3306/database";
				},
				connect() {
					let readableController: ReadableStreamDefaultController<Uint8Array>;
					return {
						readable: new ReadableStream<Uint8Array>({
							start(controller) {
								readableController = controller;
								controller.enqueue(new TextEncoder().encode("ready"));
							},
						}),
						writable: new WritableStream<Uint8Array>({
							write(chunk) {
								if (new TextDecoder().decode(chunk) === "quit") {
									readableController.close();
								}
							},
						}),
					};
				},
			});
		});
		const controller = new HyperdriveProxyController();
		let client: net.Socket | undefined;
		try {
			const config = {
				name: "hyperdrive:0:DB",
				bindingName: "DB",
				bindingId: "db",
				remoteProxyConnectionString: new URL(
					`http://127.0.0.1:${address.port}`
				),
			};
			const port = await controller.createRemoteTcpBridge(config);
			client = net.connect(port, "127.0.0.1");
			await once(client, "data");
			expect(edge.clients.size).toBe(1);
			if (state !== "active" && state !== "ended") {
				controller.beginUpdate();
				const activeAddresses = new Set<string>();
				if (state === "changed" || state === "aborted") {
					const nextPort = await controller.createRemoteTcpBridge({
						...config,
						remoteProxyConnectionString: new URL(
							`${config.remoteProxyConnectionString.href}?next`
						),
					});
					activeAddresses.add(`127.0.0.1:${nextPort}`);
				}
				if (state === "aborted") {
					controller.abortUpdate();
					expect(controller.getRemoteBridgePort(config.name)).toBe(port);
				} else {
					controller.commitUpdate(activeAddresses);
				}
				expect(client.destroyed).toBe(false);
				await vi.waitFor(() =>
					expect(edge.clients.size).toBe(state === "changed" ? 2 : 1)
				);
			}
			if (state === "restored" || state === "reconnected") {
				const retiredSession = Array.from(edge.clients)[0];
				assert(retiredSession !== undefined);
				controller.beginUpdate();
				const nextPort = await controller.createRemoteTcpBridge(config);
				controller.commitUpdate(new Set([`127.0.0.1:${nextPort}`]));
				expect(client.destroyed).toBe(false);
				expect(edge.clients.size).toBe(2);
				if (state === "reconnected") {
					retiredSession.terminate();
					await vi.waitFor(() => expect(client?.destroyed).toBe(true));
					await vi.waitFor(() => expect(edge.clients.size).toBe(1));
					expect(controller.getRemoteBridgePort(config.name)).toBe(nextPort);
					client = net.connect(nextPort, "127.0.0.1");
					await once(client, "data");
				}
			}
			if (state === "ended") {
				const closed = once(client, "close");
				client.end("quit");
				await closed;
			}
			controller.dispose();
			await vi.waitFor(() => expect(client?.destroyed).toBe(true));
			await vi.waitFor(() => expect(edge.clients.size).toBe(0), {
				timeout: 3_000,
			});
			expect(controller.getRemoteBridgePort(config.name)).toBeUndefined();
		} finally {
			client?.destroy();
			controller.dispose();
			for (const socket of edge.clients) {
				socket.terminate();
			}
			await new Promise<void>((resolve, reject) =>
				edge.close((error) => (error ? reject(error) : resolve()))
			);
		}
	}
);
