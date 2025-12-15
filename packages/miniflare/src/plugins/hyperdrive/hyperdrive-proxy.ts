import net from "node:net";
import tls from "node:tls";

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

/**
 * HyperdriveProxyController establishes TLS-enabled connections between workerd
 * and external Postgres/MySQL databases. Supports PostgreSQL sslmode options
 * ('require', 'prefer', 'disable') by proxying each Hyperdrive binding through
 * a randomly assigned local port.
 */
export class HyperdriveProxyController {
	// Map hyperdrive binding name to proxy server
	#servers = new Map<string, net.Server>();

	/**
	 * Creates a proxy server for a Hyperdrive binding.
	 *
	 * @param config - The configuration for the proxy server.
	 * @returns A promise that resolves to the port number of the proxy server.
	 */
	async createProxyServer(config: HyperdriveProxyConfig): Promise<number> {
		const { name, targetHost, targetPort, scheme, sslmode } = config;
		const server = net.createServer((clientSocket) => {
			this.#handleConnection(
				clientSocket,
				targetHost,
				Number.parseInt(targetPort),
				scheme,
				sslmode
			);
		});
		const port = await new Promise<number>((resolve, reject) => {
			server.listen(0, "127.0.0.1", () => {
				const address = server.address() as net.AddressInfo;
				if (address && typeof address !== "string") {
					resolve(address.port);
				} else {
					reject("Invalid port");
				}
			});
		});
		this.#servers.set(name, server);
		return port;
	}

	/**
	 * Handles a connection from workerd by hyperdrive magic hostname "randomUUID.hyperdrive.local"
	 *
	 * @param clientSocket - The client socket.
	 * @param targetHost - The hostname of the target database.
	 * @param targetPort - The port of the target database.
	 * @param scheme - The scheme of the target database.
	 * @param sslmode - The sslmode of the target database.
	 */
	async #handleConnection(
		clientSocket: net.Socket,
		targetHost: string,
		targetPort: number,
		scheme: string,
		sslmode: string
	) {
		// Connect to real database
		const dbSocket = net.connect({ host: targetHost, port: targetPort });
		const sslmodeRequire = sslmode === "require";
		const sslmodePrefer = sslmode === "prefer";
		if (sslmodePrefer || sslmodeRequire) {
			try {
				if (scheme === schemes.postgres || scheme === schemes.postgresql) {
					return await handlePostgresTlsConnection(
						dbSocket,
						clientSocket,
						targetHost,
						targetPort,
						sslmodeRequire
					);
				} else if (scheme === schemes.mysql) {
					return await handleMySQLTlsConnection(
						dbSocket,
						clientSocket,
						targetHost,
						targetPort,
						sslmodeRequire
					);
				}
			} catch (e) {
				if (sslmodeRequire) {
					// Write error to client so worker can read it
					clientSocket.write(`${e}\n`);
					clientSocket.end();
					dbSocket.destroy();
					return;
				}
			}
		}
		// Pipe plain tcp sockets
		clientSocket.pipe(dbSocket);
		dbSocket.pipe(clientSocket);
	}

	/** Disposes of the proxy servers when shutting down the worker.*/
	async dispose(): Promise<void> {
		await Promise.allSettled(
			Array.from(this.#servers.values()).map((server) => {
				new Promise<void>((resolve, reject) => {
					server.close((err) => (err ? reject(err) : resolve()));
				});
			})
		);
		this.#servers.clear();
	}
}

/** Handles Postgres TLS connection */
async function handlePostgresTlsConnection(
	dbSocket: net.Socket,
	clientSocket: net.Socket,
	targetHost: string,
	targetPort: number,
	sslmodeRequire: boolean
) {
	// Send Postgres sslrequest bytes
	await writeAsync(dbSocket, POSTGRES_SSL_REQUEST_PACKET);

	const response = await readAsync(dbSocket);
	// Read first byte ssl flag
	const sslResponseFlag = response.toString("utf8", 0, 1);
	if (sslResponseFlag === "S") {
		const tlsOptions: tls.ConnectionOptions = {
			socket: dbSocket,
			host: targetHost,
			servername: targetHost,
		};
		try {
			const tlsSocket = await tlsConnect(tlsOptions);
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
		clientSocket
	);
	// Pipe plain TCP sockets
	clientSocket.pipe(newDbSocket);
	newDbSocket.pipe(clientSocket);
}

/** Handles MySQL TLS connection */
async function handleMySQLTlsConnection(
	dbSocket: net.Socket,
	clientSocket: net.Socket,
	targetHost: string,
	targetPort: number,
	sslmodeRequire: boolean
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
		const tlsOptions: tls.ConnectionOptions = {
			socket: dbSocket,
			host: targetHost,
			servername: targetHost,
			minVersion: "TLSv1.2",
			rejectUnauthorized: true,
		};

		try {
			const tlsSocket = await tlsConnect(tlsOptions);

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
			if (!sslmodeRequire) {
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
		clientSocket
	);

	// Pipe plain TCP sockets
	clientSocket.pipe(newDbSocket);
	newDbSocket.pipe(clientSocket);
	return;
}

/** Create and wait for plain TCP connection */
async function createPlainTCPConnection(
	targetHost: string,
	targetPort: number,
	clientSocket: net.Socket
): Promise<net.Socket> {
	const dbSocket = net.connect({ host: targetHost, port: targetPort });

	// Wait for connection to be established
	await new Promise<void>((resolve, reject) => {
		const handleConnect = () => {
			dbSocket.off("error", handleError);
			resolve();
		};

		const handleError = (err: Error) => {
			dbSocket.off("data", handleConnect);
			reject(err);
		};

		dbSocket.once("connect", handleConnect);
		dbSocket.once("error", handleError);
	});

	// Set up error handler
	dbSocket.on("error", () => {
		clientSocket.destroy();
	});

	return dbSocket;
}

/** Set up TLS connection with pipes and error handlers */
function setupTLSConnection(
	clientSocket: net.Socket,
	tlsSocket: tls.TLSSocket
): void {
	// Set up error handler for runtime TLS errors
	tlsSocket.on("error", () => {
		clientSocket.destroy();
		tlsSocket.destroy();
	});

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

/** Ready buffer from socket and return as a promise helper function  */
function readAsync(socket: net.Socket): Promise<Buffer<ArrayBufferLike>> {
	return new Promise((resolve, reject) => {
		const handleData = (data: Buffer) => {
			socket.off("error", handleError);
			resolve(data);
		};

		const handleError = (err: Error) => {
			socket.off("data", handleData);
			reject(err);
		};

		socket.once("data", handleData);
		socket.once("error", handleError);
	});
}

function tlsConnect(options: tls.ConnectionOptions): Promise<tls.TLSSocket> {
	return new Promise((resolve, reject) => {
		const socket = tls.connect(options);

		const handleSecureConnect = () => {
			socket.off("error", handleError);
			resolve(socket);
		};

		const handleError = (err: Error) => {
			socket.off("secureConnect", handleSecureConnect);
			reject(err);
		};

		socket.once("secureConnect", handleSecureConnect);
		socket.once("error", handleError);
	});
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
	while (offset < payloadLength && payload[offset] != 0x00) offset++;

	// Skip null terminator
	offset++;

	// Skip connection_id, auth_plugin_data_part_1, filler
	offset += MYSQL_CONNECTION_ID_LENGTH;
	offset += MYSQL_AUTH_PLUGIN_DATA_PART_1_LENGTH;
	offset += MYSQL_FILLER_LENGTH;
	// Ensure there are enough bytes left for fixed fields
	if (offset + MYSQL_CAPABILITY_FLAGS_LOWER_LENGTH > payloadLength)
		return false;

	// Read 2-byte little-endian capability_flags_lower
	const caps = payload[offset] | (payload[offset + 1] << 8);

	// Check ssl support
	return (caps & MYSQL_SSL_CAPABILITY_FLAG) != 0;
}
