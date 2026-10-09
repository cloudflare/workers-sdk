import assert from "node:assert";
import { once } from "node:events";
import net from "node:net";
import { test, vi } from "vitest";
import { WebSocketServer } from "ws";
import { HyperdriveProxyController } from "../../../src/plugins/hyperdrive/hyperdrive-proxy";

test.for(["active", "removed", "changed"])(
	"disposes live connections from a %s remote listener",
	async (state, { expect }) => {
		const edge = new WebSocketServer({ port: 0, host: "127.0.0.1" });
		await once(edge, "listening");
		const address = edge.address();
		assert(address !== null && typeof address !== "string");
		edge.on("connection", (socket) => socket.send("ready"));
		const controller = new HyperdriveProxyController();
		let client: net.Socket | undefined;
		try {
			const config = {
				name: "hyperdrive:0:DB",
				bindingName: "DB",
				remoteProxyConnectionString: new URL(
					`http://127.0.0.1:${address.port}`
				),
			};
			const port = await controller.createRemoteTcpBridge(config);
			client = net.connect(port, "127.0.0.1");
			await once(client, "data");
			expect(edge.clients.size).toBe(1);
			if (state !== "active") {
				controller.beginUpdate();
				const activeAddresses = new Set<string>();
				if (state === "changed") {
					const nextPort = await controller.createRemoteTcpBridge({
						...config,
						remoteProxyConnectionString: new URL(
							`${config.remoteProxyConnectionString.href}?next`
						),
					});
					activeAddresses.add(`127.0.0.1:${nextPort}`);
				}
				controller.commitUpdate(activeAddresses);
				expect(client.destroyed).toBe(false);
				expect(edge.clients.size).toBe(1);
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
