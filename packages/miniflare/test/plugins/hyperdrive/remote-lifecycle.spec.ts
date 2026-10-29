import assert from "node:assert";
import { once } from "node:events";
import net from "node:net";
import { newWebSocketRpcSession } from "capnweb";
import { test, vi } from "vitest";
import { HyperdriveProxyController } from "../../../src/plugins/hyperdrive/hyperdrive-proxy";
import { useRemoteProxyServer } from "./helpers";

test.for(["changed", "aborted", "reconnected"])(
	"disposes live connections from a %s remote listener",
	async (state, { expect }) => {
		const { edge, url } = await useRemoteProxyServer();
		edge.on("connection", (socket) => {
			newWebSocketRpcSession(socket as unknown as WebSocket, {
				getConnectionString() {
					return "mysql://user:password@hyperdrive.local:3306/database";
				},
				connect() {
					return {
						readable: new ReadableStream<Uint8Array>({
							start(controller) {
								controller.enqueue(new TextEncoder().encode("ready"));
							},
						}),
						writable: new WritableStream<Uint8Array>(),
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
				remoteProxyConnectionString: url,
			};
			const port = await controller.createRemoteTcpBridge(config);
			client = net.connect(port, "127.0.0.1");
			await once(client, "data");
			expect(edge.clients.size).toBe(1);
			controller.beginUpdate();
			const activeAddresses = new Set<string>();
			if (state !== "reconnected") {
				const nextPort = await controller.createRemoteTcpBridge({
					...config,
					remoteProxyConnectionString: new URL(`${url.href}?next`),
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
			if (state === "reconnected") {
				const retiredSession = Array.from(edge.clients)[0];
				assert(retiredSession !== undefined);
				controller.beginUpdate();
				const nextPort = await controller.createRemoteTcpBridge(config);
				controller.commitUpdate(new Set([`127.0.0.1:${nextPort}`]));
				expect(client.destroyed).toBe(false);
				expect(edge.clients.size).toBe(2);
				retiredSession.terminate();
				await vi.waitFor(() => expect(client?.destroyed).toBe(true));
				await vi.waitFor(() => expect(edge.clients.size).toBe(1));
				expect(controller.getRemoteBridgePort(config.name)).toBe(nextPort);
				client = net.connect(nextPort, "127.0.0.1");
				await once(client, "data");
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
		}
	}
);
