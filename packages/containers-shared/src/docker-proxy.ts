import net from "node:net";

/**
 * A running named-pipe -> TCP proxy. `address` is the loopback TCP address
 * (`host:port`) that should be handed to workerd in place of the Windows Docker
 * named pipe. Disposing closes the listener and destroys any live connections.
 */
export interface DockerProxy {
	address: string;
	[Symbol.asyncDispose](): Promise<void>;
}

/**
 * workerd connects to the Docker engine via `kj::Network::parseAddress`, which on
 * Windows can only resolve TCP addresses -- it has no named-pipe support. Docker
 * Desktop on Windows listens on `\\.\pipe\docker_engine`, so we stand up a small
 * in-process TCP listener on loopback and bridge each connection to the named pipe.
 * The Docker engine speaks plain HTTP over the pipe (identical to the unix socket),
 * so a dumb bidirectional byte copy is sufficient.
 *
 * Only the workerd handoff needs this; the `docker` CLI keeps using the pipe directly.
 *
 * @param pipePath A Windows Docker host string, e.g. `//./pipe/docker_engine` or
 *   `npipe:////./pipe/docker_engine`.
 * @returns The loopback TCP address plus an async disposer.
 */
export async function startDockerProxy(pipePath: string): Promise<DockerProxy> {
	const nodePipePath = normalizePipePath(pipePath);
	const sockets = new Set<net.Socket>();

	const server = net.createServer((tcp) => {
		sockets.add(tcp);
		const pipe = net.connect({ path: nodePipePath });
		sockets.add(pipe);

		const cleanup = () => {
			sockets.delete(tcp);
			sockets.delete(pipe);
			tcp.destroy();
			pipe.destroy();
		};

		// Swallow per-connection errors so a dropped Docker connection never crashes dev.
		tcp.on("error", cleanup);
		pipe.on("error", cleanup);
		tcp.on("close", cleanup);
		pipe.on("close", cleanup);

		tcp.pipe(pipe);
		pipe.pipe(tcp);
	});

	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		// Bind to loopback only, on an ephemeral port, so the unauthenticated Docker
		// bridge is not reachable from other hosts.
		server.listen(0, "127.0.0.1", () => {
			server.removeListener("error", reject);
			resolve();
		});
	});

	const listenAddress = server.address();
	if (listenAddress === null || typeof listenAddress === "string") {
		server.close();
		throw new Error("Docker proxy failed to bind to a loopback TCP port");
	}

	return {
		address: `127.0.0.1:${listenAddress.port}`,
		async [Symbol.asyncDispose]() {
			for (const socket of sockets) {
				socket.destroy();
			}
			sockets.clear();
			await new Promise<void>((resolve) => server.close(() => resolve()));
		},
	};
}

/**
 * Convert a Windows Docker host string into a path Node's `net.connect` accepts.
 * Handles the forms `resolveDockerHost` can produce (`//./pipe/docker_engine`,
 * `npipe:////./pipe/docker_engine`, `\\.\pipe\docker_engine`) by extracting the pipe
 * name and rebuilding a canonical `\\.\pipe\<name>` path.
 */
export function normalizePipePath(pipePath: string): string {
	const match = pipePath.match(/pipe[/\\]([^/\\]+)\/?$/);
	if (match !== null) {
		return `\\\\.\\pipe\\${match[1]}`;
	}
	// Fallback for unexpected forms: strip any npipe:// scheme and use backslashes.
	const stripped = pipePath.startsWith("npipe://")
		? pipePath.slice("npipe://".length)
		: pipePath;
	return stripped.replace(/\//g, "\\");
}

/**
 * Whether a resolved Docker host string refers to a Windows named pipe (rather than
 * an already-TCP address that workerd can consume directly).
 */
export function isNamedPipeAddress(address: string): boolean {
	return (
		address.startsWith("npipe:") ||
		address.startsWith("//./pipe/") ||
		address.startsWith("\\\\.\\pipe\\")
	);
}
