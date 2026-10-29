import fs from "node:fs";
import net from "node:net";
import { Readable, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { setTimeout as delay } from "node:timers/promises";
import tls from "node:tls";
import { newWebSocketRpcSession } from "capnweb";
import WebSocket from "ws";
import type { Log } from "../../shared";
import type { RpcStub } from "capnweb";

const REMOTE_HYPERDRIVE_CONNECTION_ATTEMPTS = 3;
const REMOTE_HYPERDRIVE_CONNECTION_TIMEOUT_MS = 10_000;
const REMOTE_HYPERDRIVE_RETRY_BACKOFF_MS = 500;

export interface HyperdriveProxyConfig {
	// Name of the Hyperdrive binding
	name: string;
	// The host of the target database
	targetHost: string;
	// The port of the target database
	targetPort: string;
	// The scheme of the target database
	scheme: string;
	// The sslmode of the target database
	sslmode: string;
	// The path to the SSL root certificate, or "system" to use the system CA store
	sslrootcert?: string;
}

const schemes = {
	postgresql: "postgresql",
	postgres: "postgres",
	mysql: "mysql",
};

// Initial postgres ssl request packet
export const POSTGRES_SSL_REQUEST_PACKET = Buffer.from([
	0x00, 0x00, 0x00, 0x08, 0x04, 0xd2, 0x16, 0x2f,
]);

interface ConnectionOwner {
	track<T extends net.Socket>(socket: T): T;
	assertOpen(): void;
	close(): void;
}

interface TlsConfig {
	rejectUnauthorized: boolean;
	ca?: Buffer<ArrayBuffer>;
	checkServerIdentity?: () => undefined;
}

interface RemoteHyperdrive {
	getConnectionString(): string;
	connect(): {
		readable: ReadableStream<Uint8Array>;
		writable: WritableStream<Uint8Array>;
	};
}

interface ProxyServer {
	server: net.Server;
	port: number;
	connections: Set<ConnectionOwner>;
	session?: {
		stub: RpcStub<RemoteHyperdrive>;
		connectionString: string;
	};
}

/**
 * Builds TLS configuration based on sslmode and sslrootcert settings.
 *
 * - verify-full: validates the server certificate against CA and checks hostname
 * - verify-ca: validates the server certificate against CA but skips hostname check
 * - require/prefer: connects with TLS but does not validate the server certificate
 * - sslrootcert=system: uses Node.js default system CA store
 * - sslrootcert=<path>: reads the CA certificate from the specified file path
 */
function buildTlsConfig(
	sslmodeVerifyFull: boolean,
	sslmodeVerifyCa: boolean,
	sslrootcert?: string
): TlsConfig {
	if (!sslmodeVerifyFull && !sslmodeVerifyCa) {
		return { rejectUnauthorized: false };
	}

	const config: TlsConfig = { rejectUnauthorized: true };

	// Load custom CA certificate if sslrootcert is a file path (not "system")
	if (sslrootcert && sslrootcert !== "system") {
		config.ca = fs.readFileSync(sslrootcert);
	}
	// When sslrootcert=system (or omitted for verify modes), Node.js uses its
	// default system CA store automatically, so no explicit ca is needed.

	if (sslmodeVerifyCa) {
		// verify-ca validates the certificate chain but does not check the hostname
		config.checkServerIdentity = () => undefined;
	}

	return config;
}

/**
 * Assembles a complete `tls.ConnectionOptions` from the base socket/host info
 * and the verification policy captured in `TlsConfig`.
 *
 * Keeping this separate from `buildTlsConfig` lets each protocol handler
 * (Postgres, MySQL) call it with their own socket without duplicating the
 * CA / hostname-verification logic inline.
 */
function buildTlsConnectionOptions(
	dbSocket: net.Socket,
	targetHost: string,
	tlsConfig: TlsConfig,
	extra?: Partial<tls.ConnectionOptions>
): tls.ConnectionOptions {
	const options: tls.ConnectionOptions = {
		socket: dbSocket,
		host: targetHost,
		// SNI only accepts hostnames. Passing an IP here breaks on Node 25+
		servername: net.isIP(targetHost) === 0 ? targetHost : undefined,
		rejectUnauthorized: tlsConfig.rejectUnauthorized,
		...extra,
	};

	if (tlsConfig.ca) {
		options.ca = tlsConfig.ca;
	}

	if (tlsConfig.checkServerIdentity) {
		options.checkServerIdentity = tlsConfig.checkServerIdentity;
	}

	return options;
}

/**
 * HyperdriveProxyController establishes TLS-enabled connections between workerd
 * and external Postgres/MySQL databases. Supports PostgreSQL sslmode options
 * ('require', 'prefer', 'disable', 'verify-full', 'verify-ca') by proxying
 * each Hyperdrive binding through a randomly assigned local port.
 */
export class HyperdriveProxyController {
	// Map a binding and target to the listening proxy server and port
	#servers = new Map<string, ProxyServer>();
	#starting = new Map<string, Promise<number>>();
	#retiredServers = new Set<ProxyServer>();
	#remoteBindings = new Map<string, ProxyServer>();
	#abortController = new AbortController();
	#signal: AbortSignal;
	#update?: {
		created: Set<string>;
		remoteBindings: Map<string, ProxyServer>;
	};
	#disposed = false;
	log?: Log;

	constructor(signal?: AbortSignal) {
		this.#signal = signal
			? AbortSignal.any([this.#abortController.signal, signal])
			: this.#abortController.signal;
	}

	#createOwner(entry: ProxyServer, clientSocket: net.Socket): ConnectionOwner {
		const sockets = new Set<net.Socket>();
		let closed = false;
		const owner: ConnectionOwner = {
			track(socket) {
				if (closed) {
					socket.destroy();
					return socket;
				}
				sockets.add(socket);
				socket.once("close", () => sockets.delete(socket));
				return socket;
			},
			assertOpen() {
				if (closed || clientSocket.destroyed || clientSocket.readableEnded) {
					throw new Error("Hyperdrive connection closed");
				}
			},
			close: () => {
				if (closed) {
					return;
				}
				closed = true;
				for (const socket of sockets) {
					socket.destroy();
				}
				entry.connections.delete(owner);
				if (
					entry.connections.size === 0 &&
					this.#retiredServers.delete(entry)
				) {
					entry.session?.stub[Symbol.dispose]();
				}
			},
		};
		entry.connections.add(owner);
		owner.track(clientSocket);
		clientSocket.once("close", owner.close);
		return owner;
	}

	/**
	 * Stops a listener accepting new connections and forgets it, leaving any
	 * connection it already accepted to finish on its own. Used when a reload
	 * stops using a listener; a query mid-flight should not fail because the
	 * config around it changed.
	 */
	#retireServer(key: string): void {
		const entry = this.#servers.get(key);
		if (entry === undefined) {
			return;
		}
		entry.server.close();
		this.#servers.delete(key);
		if (entry.connections.size > 0) {
			this.#retiredServers.add(entry);
		} else {
			entry.session?.stub[Symbol.dispose]();
		}
		for (const [name, active] of this.#remoteBindings) {
			if (active === entry) {
				this.#remoteBindings.delete(name);
			}
		}
	}

	/**
	 * Creates a proxy server for a Hyperdrive binding.
	 *
	 * @param config - The configuration for the proxy server.
	 * @returns A promise that resolves to the port number of the proxy server.
	 */
	async createProxyServer(config: HyperdriveProxyConfig): Promise<number> {
		if (this.#disposed) {
			throw new Error("Hyperdrive proxy controller has been disposed");
		}
		const { name, targetHost, targetPort, scheme, sslmode, sslrootcert } =
			config;
		const key = JSON.stringify([
			name,
			targetHost,
			targetPort,
			scheme,
			sslmode,
			sslrootcert,
		]);
		const update = this.#update;
		const existing = this.#servers.get(key);
		if (existing !== undefined) {
			return existing.port;
		}
		const starting = this.#starting.get(key);
		if (starting !== undefined) {
			return starting;
		}
		const promise = this.#startProxyServer(config, key, update);
		this.#starting.set(key, promise);
		try {
			return await promise;
		} finally {
			this.#starting.delete(key);
		}
	}

	async #startProxyServer(
		config: HyperdriveProxyConfig,
		key: string,
		update?: { created: Set<string> }
	): Promise<number> {
		const { name, targetHost, targetPort, scheme, sslmode, sslrootcert } =
			config;
		const entry: ProxyServer = {
			server: net.createServer(),
			port: 0,
			connections: new Set(),
		};
		entry.server.on("connection", (clientSocket) => {
			clientSocket.setNoDelay(true);
			const owner = this.#createOwner(entry, clientSocket);
			clientSocket.once("end", owner.close);
			clientSocket.once("error", owner.close);
			void this.#handleConnection(
				clientSocket,
				targetHost,
				Number.parseInt(targetPort),
				scheme,
				sslmode,
				owner,
				sslrootcert
			).catch(() => owner.close());
		});
		return this.#startServer(key, entry, "proxy server", name, update);
	}

	async #startServer(
		key: string,
		entry: ProxyServer,
		description: string,
		name: string,
		update?: { created: Set<string> }
	): Promise<number> {
		const { server } = entry;
		server.on("error", (err) => {
			this.log?.error(
				new Error(
					`Hyperdrive ${description} error for binding "${name}": ${err.message}`
				)
			);
		});
		const port = await new Promise<number>((resolve, reject) => {
			server.once("error", reject);
			server.listen(0, "127.0.0.1", () => {
				server.off("error", reject);
				const address = server.address();
				if (address !== null && typeof address !== "string") {
					resolve(address.port);
				} else {
					reject(new Error("Invalid port"));
				}
			});
		});
		if (this.#disposed || (update !== undefined && this.#update !== update)) {
			server.close();
			throw new Error("Hyperdrive proxy configuration update was interrupted");
		}
		entry.port = port;
		this.#servers.set(key, entry);
		update?.created.add(key);
		return port;
	}

	/** Port of the local TCP bridge for a remote binding, if one is running. */
	getRemoteBridgePort(name: string): number | undefined {
		return this.#remoteBindings.get(name)?.port;
	}

	/** Returns credentials from the session that opens this binding's sockets. */
	getRemoteConnectionString(name: string): string | undefined {
		return this.#remoteBindings.get(name)?.session?.connectionString;
	}

	/**
	 * Handles a connection from workerd by hyperdrive magic hostname "randomUUID.hyperdrive.local"
	 *
	 * @param clientSocket - The client socket.
	 * @param targetHost - The hostname of the target database.
	 * @param targetPort - The port of the target database.
	 * @param scheme - The scheme of the target database.
	 * @param sslmode - The sslmode of the target database.
	 * @param sslrootcert - Path to the SSL root certificate, or "system" to use the system CA store.
	 */
	async #handleConnection(
		clientSocket: net.Socket,
		targetHost: string,
		targetPort: number,
		scheme: string,
		sslmode: string,
		owner: ConnectionOwner,
		sslrootcert?: string
	) {
		// Track outbound sockets before any connect or TLS wait can yield.
		const dbSocket = owner.track(
			net.connect({ host: targetHost, port: targetPort })
		);
		dbSocket.on("error", () => {});
		dbSocket.setNoDelay(true);
		const sslmodeRequire = sslmode === "require";
		const sslmodePrefer = sslmode === "prefer";
		const sslmodeVerifyFull = sslmode === "verify-full";
		const sslmodeVerifyCa = sslmode === "verify-ca";
		// verify-full and verify-ca are strict modes that must always attempt TLS
		const sslmodeStrict = sslmodeVerifyFull || sslmodeVerifyCa;

		if (sslmodePrefer || sslmodeRequire || sslmodeStrict) {
			try {
				const tlsConfig = buildTlsConfig(
					sslmodeVerifyFull,
					sslmodeVerifyCa,
					sslrootcert
				);
				if (scheme === schemes.postgres || scheme === schemes.postgresql) {
					return await handlePostgresTlsConnection(
						dbSocket,
						clientSocket,
						targetHost,
						targetPort,
						sslmodeRequire || sslmodeStrict,
						tlsConfig,
						owner
					);
				} else if (scheme === schemes.mysql) {
					return await handleMySQLTlsConnection(
						dbSocket,
						clientSocket,
						targetHost,
						targetPort,
						sslmodeRequire || sslmodeStrict,
						tlsConfig,
						owner
					);
				}
			} catch (e) {
				if (!clientSocket.destroyed) {
					clientSocket.write(`${e}\n`);
					clientSocket.end();
				}
				dbSocket.destroy();
				return;
			}
		}
		setupTLSConnection(clientSocket, dbSocket);
	}

	/**
	 * Creates a local TCP bridge for a *remote* Hyperdrive binding.
	 *
	 * The bridge is a plain `net.Server` on `127.0.0.1:<port>`; the binding's
	 * `external.tcp` designator points at it, so workerd stays unmodified —
	 * pointing a Hyperdrive designator at a Worker service crashes workerd
	 * (SIGSEGV). Each inbound TCP connection is relayed, byte-for-byte, over a
	 * shared RPC session that owns both the credentials and the edge binding.
	 * Each client gets its own socket without moving to another Worker instance.
	 *
	 * Bridges share `createProxyServer`'s lifecycle: one is reused across
	 * reloads while its target is unchanged, and `commitUpdate()` retires it
	 * once a reload stops using it — including when the binding is removed or
	 * switched to local.
	 *
	 * @returns the local bridge port the designator should target.
	 */
	async createRemoteTcpBridge(config: {
		// Unique per-worker key for this bridge (see `getHyperdriveServiceName`),
		// used to track the listener across reloads.
		name: string;
		// The binding name as the Worker declares it. This is what the edge relay
		// dispatches on, so it must stay unqualified.
		bindingName: string;
		bindingId: string;
		// The remote proxy connection string (a local URL that upgrades to a
		// WebSocket relaying to the edge Hyperdrive binding).
		remoteProxyConnectionString: URL;
	}): Promise<number> {
		if (this.#disposed) {
			throw new Error("Hyperdrive proxy controller has been disposed");
		}
		const { name, bindingName, bindingId, remoteProxyConnectionString } =
			config;
		const wsUrl = new URL(remoteProxyConnectionString.href);
		wsUrl.protocol = wsUrl.protocol === "https:" ? "wss:" : "ws:";
		wsUrl.searchParams.set("MF-Binding", bindingName);
		const wsHref = wsUrl.href;
		const key = JSON.stringify([
			"remote",
			name,
			bindingName,
			bindingId,
			wsHref,
		]);
		const update = this.#update;
		const existing = this.#servers.get(key);
		if (existing !== undefined) {
			this.#remoteBindings.set(name, existing);
			return existing.port;
		}
		const starting = this.#starting.get(key);
		if (starting !== undefined) {
			return starting;
		}
		const promise = this.#startRemoteTcpBridge(
			key,
			name,
			bindingName,
			wsHref,
			update
		);
		this.#starting.set(key, promise);
		try {
			return await promise;
		} finally {
			this.#starting.delete(key);
		}
	}

	async #startRemoteTcpBridge(
		key: string,
		name: string,
		bindingName: string,
		wsHref: string,
		update?: { created: Set<string> }
	): Promise<number> {
		const session = await this.#connectRemoteHyperdrive(
			wsHref,
			bindingName,
			this.#signal
		);
		const entry: ProxyServer = {
			server: net.createServer(),
			port: 0,
			connections: new Set(),
			session,
		};
		entry.server.on("connection", (clientSocket) => {
			clientSocket.setNoDelay(true);
			this.#createOwner(entry, clientSocket);
			if (session) {
				void this.#handleRemoteBridgeConnection(clientSocket, session.stub);
			} else {
				clientSocket.destroy();
			}
		});
		const port = await this.#startServer(
			key,
			entry,
			"remote bridge",
			name,
			update
		).catch((error: unknown) => {
			session?.stub[Symbol.dispose]();
			throw error;
		});
		this.#remoteBindings.set(name, entry);
		session?.stub.onRpcBroken(() => {
			if (!this.#disposed && this.#servers.get(key) === entry) {
				this.#retireServer(key);
				this.log?.warn(
					`Remote Hyperdrive connection for binding "${bindingName}" was lost. Reload local development to reconnect.`
				);
			}
		});
		return port;
	}

	async #connectRemoteHyperdrive(
		wsHref: string,
		bindingName: string,
		signal: AbortSignal
	) {
		for (
			let attempt = 1;
			attempt <= REMOTE_HYPERDRIVE_CONNECTION_ATTEMPTS;
			attempt++
		) {
			signal.throwIfAborted();
			const websocket = new WebSocket(wsHref, {
				headers: process.env.CF_TRACE_ID
					? { "cf-trace-id": process.env.CF_TRACE_ID }
					: undefined,
			});
			const stub = newWebSocketRpcSession<RemoteHyperdrive>(
				websocket as unknown as globalThis.WebSocket
			);
			function abortConnection() {
				stub[Symbol.dispose]();
				websocket.terminate();
			}
			signal.addEventListener("abort", abortConnection, { once: true });
			const timeout = setTimeout(
				() => websocket.terminate(),
				REMOTE_HYPERDRIVE_CONNECTION_TIMEOUT_MS
			);
			try {
				const connectionString = await stub.getConnectionString();
				signal.throwIfAborted();
				if (typeof connectionString !== "string") {
					throw new Error("Missing Hyperdrive connection string");
				}
				return { stub, connectionString };
			} catch {
				stub[Symbol.dispose]();
				signal.throwIfAborted();
			} finally {
				clearTimeout(timeout);
				signal.removeEventListener("abort", abortConnection);
			}
			if (attempt < REMOTE_HYPERDRIVE_CONNECTION_ATTEMPTS) {
				await delay(REMOTE_HYPERDRIVE_RETRY_BACKOFF_MS * attempt, undefined, {
					signal,
				});
			}
		}
		this.log?.warn(
			`Unable to connect remote Hyperdrive binding "${bindingName}". Other bindings are still available. Restart local development to retry.`
		);
	}

	/**
	 * Relays an independent TCP stream through the credential-owning RPC session.
	 */
	async #handleRemoteBridgeConnection(
		clientSocket: net.Socket,
		stub: RpcStub<RemoteHyperdrive>
	): Promise<void> {
		clientSocket.pause();
		function destroyClient() {
			clientSocket.destroy();
		}
		clientSocket.on("error", destroyClient);
		try {
			const socket = await stub.connect();
			try {
				if (clientSocket.destroyed) {
					await Promise.allSettled([
						socket.readable.cancel(),
						socket.writable.abort(),
					]);
					return;
				}
				await Promise.all([
					pipeline(clientSocket, Writable.fromWeb(socket.writable)),
					pipeline(Readable.fromWeb(socket.readable), clientSocket),
				]);
			} finally {
				socket[Symbol.dispose]();
			}
		} catch {
			clientSocket.destroy();
		} finally {
			clientSocket.off("error", destroyClient);
		}
	}

	/** Begins tracking proxy servers created for the next runtime config. */
	beginUpdate(): void {
		if (this.#update !== undefined) {
			throw new Error("Hyperdrive proxy configuration update already started");
		}
		this.#update = {
			created: new Set(),
			remoteBindings: new Map(this.#remoteBindings),
		};
	}

	/** Stops listeners omitted by the successfully installed runtime config. */
	commitUpdate(activeAddresses: ReadonlySet<string>): void {
		const update = this.#update;
		if (update === undefined) {
			return;
		}
		this.#update = undefined;
		for (const [key, { port }] of this.#servers) {
			if (!activeAddresses.has(`127.0.0.1:${port}`)) {
				this.#retireServer(key);
			}
		}
	}

	/** Discards new listeners and restores addresses after a failed config update. */
	abortUpdate(): void {
		const update = this.#update;
		if (update === undefined) {
			return;
		}
		this.#update = undefined;
		for (const key of update.created) {
			this.#retireServer(key);
		}
		const activeServers = new Set(this.#servers.values());
		this.#remoteBindings = new Map(
			Array.from(update.remoteBindings).filter(([, entry]) =>
				activeServers.has(entry)
			)
		);
	}

	/** Disposes of the proxy servers when shutting down the worker.*/
	dispose(): void {
		this.#disposed = true;
		this.#abortController.abort();
		this.#update = undefined;
		const entries = [...this.#servers.values(), ...this.#retiredServers];
		this.#servers.clear();
		this.#retiredServers.clear();
		this.#remoteBindings.clear();
		for (const entry of entries) {
			entry.server.close();
			entry.session?.stub[Symbol.dispose]();
			for (const owner of entry.connections) {
				owner.close();
			}
		}
	}
}

/** Handles Postgres TLS connection */
async function handlePostgresTlsConnection(
	dbSocket: net.Socket,
	clientSocket: net.Socket,
	targetHost: string,
	targetPort: number,
	sslmodeRequire: boolean,
	tlsConfig: TlsConfig,
	owner: ConnectionOwner
) {
	// Consume pending startup bytes so EOF can cancel negotiation. Bound this
	// buffer rather than allowing a stalled database to accumulate client input.
	const startupChunks: Buffer[] = [];
	let startupLength = 0;
	const collectStartup = (chunk: Buffer) => {
		startupLength += chunk.length;
		if (startupLength > 64 * 1024) {
			owner.close();
			return;
		}
		startupChunks.push(chunk);
	};
	const releaseStartup = () => {
		clientSocket.pause();
		clientSocket.off("data", collectStartup);
		owner.assertOpen();
		if (startupLength > 0) {
			clientSocket.unshift(Buffer.concat(startupChunks));
		}
	};
	clientSocket.on("data", collectStartup);
	clientSocket.resume();
	try {
		// Send Postgres sslrequest bytes
		await writeAsync(dbSocket, POSTGRES_SSL_REQUEST_PACKET);

		const response = await readAsync(dbSocket);
		// Read first byte ssl flag
		const sslResponseFlag = response.toString("utf8", 0, 1);
		if (sslResponseFlag === "S") {
			const tlsOptions = buildTlsConnectionOptions(
				dbSocket,
				targetHost,
				tlsConfig
			);
			try {
				const tlsSocket = await tlsConnect(tlsOptions, owner);
				releaseStartup();
				setupTLSConnection(clientSocket, tlsSocket);
				return;
			} catch (e) {
				if (sslmodeRequire) {
					throw e;
				}
				// Fallback to plain TCP connection
			}
		}
		// Server doesn't support SSL but client requires it
		if (sslmodeRequire) {
			throw Error("Server does not support SSL, but client requires SSL.");
		}
		// fallback to plain TCP
		dbSocket.destroy();
		const newDbSocket = await createPlainTCPConnection(
			targetHost,
			targetPort,
			clientSocket,
			owner
		);
		releaseStartup();
		// Pipe plain TCP sockets
		setupTLSConnection(clientSocket, newDbSocket);
	} finally {
		clientSocket.off("data", collectStartup);
	}
}

/** Handles MySQL TLS connection */
async function handleMySQLTlsConnection(
	dbSocket: net.Socket,
	clientSocket: net.Socket,
	targetHost: string,
	targetPort: number,
	sslmodeRequire: boolean,
	tlsConfig: TlsConfig,
	owner: ConnectionOwner
) {
	const initPacketChunk = await readAsync(dbSocket);
	// Little-endian parse payload header length
	const payloadHeaderLength =
		initPacketChunk[0] | (initPacketChunk[1] << 8) | (initPacketChunk[2] << 16);

	// Handle reading bytes until correct amount payload body length
	let fullPayloadBody: Buffer<ArrayBuffer>;
	const payloadStart = 4;
	const alreadyRead = initPacketChunk.length - payloadStart;
	if (alreadyRead === payloadHeaderLength) {
		fullPayloadBody = Buffer.from(initPacketChunk.subarray(payloadStart));
	} else if (alreadyRead < payloadHeaderLength) {
		const chunks = [initPacketChunk.subarray(payloadStart)];
		let totalRead = alreadyRead;
		while (totalRead < payloadHeaderLength) {
			const chunk = await readAsync(dbSocket);
			chunks.push(chunk);
			totalRead += chunk.length;
		}
		fullPayloadBody = Buffer.concat(chunks);
		// Trim if we read too much
		if (totalRead > payloadHeaderLength) {
			fullPayloadBody = fullPayloadBody.subarray(0, payloadHeaderLength);
		}
	} else {
		throw Error("Could not parse header properly.");
	}

	if (mysqlSupportsSSL(fullPayloadBody)) {
		// Send our own fixed SSL request to MySQL server with minimal capabilities
		const sslRequestPacket: number[] = [
			0x20,
			0x00,
			0x00,
			0x01, // payload length = 32, sequence id = 1
			0x00,
			0x0a,
			0x00,
			0x00, // capability_flags = CLIENT_SSL | CLIENT_PROTOCOL_41
			0x00,
			0x00,
			0x00,
			0x00, // max_packet_size = 0
			0x21, // character_set = utf8_general_ci
			...new Array(23).fill(0x00), // reserved (23 bytes)
		];
		await writeAsync(dbSocket, sslRequestPacket);

		// Upgrade server connection to TLS
		const tlsOptions = buildTlsConnectionOptions(
			dbSocket,
			targetHost,
			tlsConfig,
			{ minVersion: "TLSv1.2" }
		);

		try {
			const tlsSocket = await tlsConnect(tlsOptions, owner);

			// Send original init packet to client (with SSL capability)
			const fullInitPacket = Buffer.concat([
				initPacketChunk.subarray(0, 4),
				fullPayloadBody,
			]);
			await writeAsync(clientSocket, fullInitPacket);
			const clientAuthPayload = await readAsync(clientSocket);

			// Forward client auth to server and increment sequence ID byte to keep client driver/server in sync
			clientAuthPayload[3]++;
			await writeAsync(tlsSocket, clientAuthPayload);

			// Read and forward server's response, and fix sequence ID byte back to client
			const authResponsePayload = await readAsync(tlsSocket);
			authResponsePayload[3]--;
			await writeAsync(clientSocket, authResponsePayload);

			// Set up pipes with error handler
			setupTLSConnection(clientSocket, tlsSocket);
			return;
		} catch (e) {
			if (sslmodeRequire) {
				throw e;
			}
			// Attempt to fall back to plain TCP
		}
	}
	if (sslmodeRequire) {
		throw new Error("Server SSL failed, but client requires SSL.");
	}
	// Disconnect original socket to DB
	dbSocket.destroy();

	// Create new connection and send init packet without SSL capability
	const newDbSocket = await createPlainTCPConnection(
		targetHost,
		targetPort,
		clientSocket,
		owner
	);

	// Pipe plain TCP sockets
	setupTLSConnection(clientSocket, newDbSocket);
	return;
}

/** Creates a fallback socket only while the client still owns the connection. */
async function createPlainTCPConnection(
	targetHost: string,
	targetPort: number,
	clientSocket: net.Socket,
	owner: ConnectionOwner
): Promise<net.Socket> {
	owner.assertOpen();
	const dbSocket = owner.track(
		net.connect({ host: targetHost, port: targetPort })
	);
	dbSocket.setNoDelay(true);
	dbSocket.on("error", () => clientSocket.destroy());
	await waitForSocket(dbSocket, "connect");
	owner.assertOpen();
	return dbSocket;
}

/** Set up TLS connection with pipes and error handlers */
function setupTLSConnection(
	clientSocket: net.Socket,
	tlsSocket: net.Socket
): void {
	// Set up error handler for runtime TLS errors
	tlsSocket.on("error", () => {
		clientSocket.destroy();
		tlsSocket.destroy();
	});

	tlsSocket.once("close", () => clientSocket.destroy());
	// Pipe sockets
	clientSocket.pipe(tlsSocket);
	tlsSocket.pipe(clientSocket);
}

/** Write buffer to socket and return as a promise helper function  */
function writeAsync(
	socket: net.Socket,
	bytes: Buffer<ArrayBuffer> | Uint8Array | number[]
): Promise<void> {
	return new Promise((resolve, reject) => {
		const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
		socket.write(buffer, (err) => (err ? reject(err) : resolve()));
	});
}

/** Reads the next chunk, rejecting when the peer closes before sending it. */
function readAsync(socket: net.Socket): Promise<Buffer<ArrayBufferLike>> {
	return new Promise((resolve, reject) => {
		const cleanup = () => {
			socket.off("data", handleData);
			socket.off("error", handleError);
			socket.off("close", handleClose);
			socket.off("end", handleClose);
		};
		const handleData = (data: Buffer) => {
			cleanup();
			resolve(data);
		};
		const handleError = (err: Error) => {
			cleanup();
			reject(err);
		};
		const handleClose = () =>
			handleError(new Error("Hyperdrive connection closed"));
		if (socket.destroyed || socket.readableEnded) {
			handleClose();
			return;
		}
		socket.once("data", handleData);
		socket.once("error", handleError);
		socket.once("close", handleClose);
		socket.once("end", handleClose);
	});
}

/** Waits for TCP/TLS readiness without retaining listeners after settlement. */
function waitForSocket(
	socket: net.Socket,
	event: "connect" | "secureConnect"
): Promise<void> {
	return new Promise((resolve, reject) => {
		const cleanup = () => {
			socket.off(event, handleReady);
			socket.off("error", handleError);
			socket.off("close", handleClose);
			socket.off("end", handleClose);
		};
		const handleReady = () => {
			cleanup();
			resolve();
		};
		const handleError = (error: Error) => {
			cleanup();
			reject(error);
		};
		const handleClose = () =>
			handleError(new Error("Hyperdrive connection closed"));
		if (socket.destroyed || socket.readableEnded) {
			handleClose();
			return;
		}
		socket.once(event, handleReady);
		socket.once("error", handleError);
		socket.once("close", handleClose);
		socket.once("end", handleClose);
	});
}

async function tlsConnect(
	options: tls.ConnectionOptions,
	owner: ConnectionOwner
): Promise<tls.TLSSocket> {
	owner.assertOpen();
	const socket = owner.track(tls.connect(options));
	socket.on("error", () => {});
	await waitForSocket(socket, "secureConnect");
	owner.assertOpen();
	return socket;
}

/** MySQL helper that skips through reading the init packet
 * until we get to the ssl capability flag, only need to look at lower 16 bits
 * docs: https://dev.mysql.com/doc/dev/mysql-server/latest/page_protocol_connection_phase_packets_protocol_handshake_v10.html
 */
const MYSQL_CONNECTION_ID_LENGTH = 4;
const MYSQL_AUTH_PLUGIN_DATA_PART_1_LENGTH = 8;
const MYSQL_FILLER_LENGTH = 1;
const MYSQL_CAPABILITY_FLAGS_LOWER_LENGTH = 2;
const MYSQL_SSL_CAPABILITY_FLAG = 2048;
function mysqlSupportsSSL(payload: Buffer<ArrayBuffer>): boolean {
	const payloadLength = payload.length;
	let offset = 1;

	// Find end of server_version string (null terminator)
	while (offset < payloadLength && payload[offset] != 0x00) {
		offset++;
	}

	// Skip null terminator
	offset++;

	// Skip connection_id, auth_plugin_data_part_1, filler
	offset += MYSQL_CONNECTION_ID_LENGTH;
	offset += MYSQL_AUTH_PLUGIN_DATA_PART_1_LENGTH;
	offset += MYSQL_FILLER_LENGTH;
	// Ensure there are enough bytes left for fixed fields
	if (offset + MYSQL_CAPABILITY_FLAGS_LOWER_LENGTH > payloadLength) {
		return false;
	}

	// Read 2-byte little-endian capability_flags_lower
	const caps = payload[offset] | (payload[offset + 1] << 8);

	// Check ssl support
	return (caps & MYSQL_SSL_CAPABILITY_FLAG) != 0;
}
