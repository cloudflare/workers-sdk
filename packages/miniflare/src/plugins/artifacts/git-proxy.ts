import { connect, createServer } from "node:net";
import { pipeline } from "node:stream";
import type { Socket } from "node:net";

/** Keeps clone URLs stable while workerd binds a fresh ephemeral port on reload. */
export async function startGitProxy() {
	let targetPort: number | undefined;
	const connections = new Set<Socket>();
	const server = createServer((client) => {
		if (targetPort === undefined) {
			client.destroy();
			return;
		}
		const upstream = connect(targetPort, "127.0.0.1");
		connections.add(client);
		connections.add(upstream);
		client.once("close", () => connections.delete(client));
		upstream.once("close", () => connections.delete(upstream));
		// A failure in either direction must also close the other socket.
		pipeline(client, upstream, client, () => {});
	});
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => {
			server.off("error", reject);
			resolve();
		});
	});
	server.unref();
	const address = server.address();
	if (!address || typeof address === "string") {
		throw new Error("Unable to start local Artifacts Git listener");
	}
	return {
		port: address.port,
		setTarget(port: number) {
			targetPort = port;
		},
		close() {
			for (const socket of connections) {
				socket.destroy();
			}
			return new Promise<void>((resolve, reject) => {
				server.close((error) => (error ? reject(error) : resolve()));
			});
		},
	};
}
