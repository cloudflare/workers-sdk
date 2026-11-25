import net from "node:net";
import { pipeline } from "node:stream";

/**
 * Listens on the port Git clients use for a namespace, and forwards each
 * connection to workerd's Git socket. workerd binds that socket to a port of
 * its own choosing, so no port is ever probed and then bound later: in that
 * window another process could take it, and workerd would fail to start.
 * Holding the listener here also keeps the port across workerd restarts.
 */
export class GitRelay {
	#runtimePort?: number;
	readonly #connections = new Set<net.Socket>();

	private constructor(
		private readonly server: net.Server,
		readonly port: number
	) {}

	/**
	 * Listens on `preferredPort` if it's free, otherwise on any free port.
	 */
	static async listen(preferredPort?: number): Promise<GitRelay> {
		const server = net.createServer({ allowHalfOpen: true });
		let port: number;
		try {
			port = await listen(server, preferredPort ?? 0);
		} catch (error) {
			if (preferredPort === undefined || !isAddressUnavailable(error)) {
				throw error;
			}
			port = await listen(server, 0);
		}
		const relay = new GitRelay(server, port);
		server.on("connection", (client) => relay.#forward(client));
		// Failing to accept a connection, for example when out of file
		// descriptors, costs only that connection, and the server keeps listening.
		server.on("error", () => {});
		return relay;
	}

	/**
	 * Sets the port workerd's Git socket listens on. Connections accepted while
	 * it is unset are refused.
	 */
	setRuntimePort(port: number | undefined): void {
		this.#runtimePort = port;
	}

	/**
	 * Stops listening, and cuts off connections still open, including Git
	 * transfers in progress.
	 */
	async close(): Promise<void> {
		const closed = new Promise<void>((resolve) =>
			this.server.close(() => resolve())
		);
		for (const socket of this.#connections) {
			socket.destroy();
		}
		await closed;
	}

	#track(socket: net.Socket): net.Socket {
		this.#connections.add(socket);
		socket.once("close", () => this.#connections.delete(socket));
		return socket;
	}

	#forward(client: net.Socket): void {
		this.#track(client);
		if (this.#runtimePort === undefined) {
			client.destroy();
			return;
		}
		const upstream = this.#track(
			net.connect({
				host: "127.0.0.1",
				port: this.#runtimePort,
				allowHalfOpen: true,
			})
		);
		// Any failure destroys both sockets, which is all a client can be told.
		pipeline(client, upstream, client, () => {});
	}
}

function listen(server: net.Server, port: number): Promise<number> {
	return new Promise((resolve, reject) => {
		function listening() {
			server.off("error", failed);
			const address = server.address();
			if (address === null || typeof address === "string") {
				reject(new Error("Local Artifacts Git listener has no TCP port"));
			} else {
				resolve(address.port);
			}
		}
		function failed(error: Error) {
			server.off("listening", listening);
			reject(error);
		}
		server.once("listening", listening);
		server.once("error", failed);
		server.listen({ host: "127.0.0.1", port, exclusive: true });
	});
}

function isAddressUnavailable(error: unknown): boolean {
	const code = (error as NodeJS.ErrnoException | undefined)?.code;
	return code === "EADDRINUSE" || code === "EACCES";
}
