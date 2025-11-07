import net from "node:net";
import tls from "node:tls";

export class HyperdriveProxyController {
	// Map hyperdrive binding name to proxy server
	#servers = new Map<string, net.Server>();

	async createProxyServer(
		name: string,
		targetHost: string,
		targetPort: string,
		scheme: string,
		sslmode: string
	): Promise<number> {
		const server = net.createServer((clientSocket) => {
			this.#handleConnection(
				clientSocket,
				targetHost,
				Number.parseInt(targetPort),
				scheme,
				sslmode
			);
		});
		const port = await new Promise<number>((resolve) => {
			server.listen(0, "localhost", () => {
				const addr = server.address() as net.AddressInfo;
				resolve(addr.port);
			});
		});
		this.#servers.set(name, server);
		return port;
	}

	// Connected from workerd by hyperdrive magic hostname "randomUUID.hyperdrive.local"
	async #handleConnection(
		clientSocket: net.Socket,
		targetHost: string,
		targetPort: number,
		scheme: string,
		sslmode: string
	) {
		// Connect to real database
		let dbSocket = net.connect({ host: targetHost, port: targetPort });
		const sslmodeRequire = sslmode === "require";
		const sslmodePrefer = sslmode === "prefer";
		let retryConnection = false;
		if (sslmodePrefer || sslmodeRequire) {
			try {
				if (scheme === "postgres" || scheme === "postgresql") {
					// Send Postgres sslrequest bytes
					const sslRequestPacket = Buffer.from([
						0x00, 0x00, 0x00, 0x08, 0x04, 0xd2, 0x16, 0x2f,
					]);
					await writeAsync(dbSocket, sslRequestPacket);

					const response = await readAsync(dbSocket);
					// Read first byte ssl flag
					const sslResponseFlag = response.toString("utf8", 0, 1);
					if (sslResponseFlag === "S") {
						//Let tlsSocket = upgradeTlsStream(dbSocket, targetHost);
						const tlsOptions: tls.ConnectionOptions = {
							socket: dbSocket,
							host: targetHost,
							servername: targetHost,
						};
						const tlsSocket = tls.connect(tlsOptions);
						clientSocket.pipe(tlsSocket);
						tlsSocket.pipe(clientSocket);
						return;
					} else {
						// Server doesn't support SSL but we require it
						if (sslmodeRequire) {
							throw Error(
								"Server does not support SSL, but client requires SSL."
							);
						}
					}
				} else if (scheme === "mysql") {
					const initPacketChunk = await readAsync(dbSocket);
					// Little-endian parse payload header length
					const payloadHeaderLength =
						initPacketChunk[0] |
						(initPacketChunk[1] << 8) |
						(initPacketChunk[2] << 16);

					// Handle reading bytes until correct amount payload body length
					let fullPayloadBody: Buffer<ArrayBuffer>;
					const payloadStart = 4;
					const alreadyRead = initPacketChunk.length - payloadStart;
					if (alreadyRead === payloadHeaderLength) {
						fullPayloadBody = Buffer.from(
							initPacketChunk.subarray(payloadStart)
						);
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
							fullPayloadBody = fullPayloadBody.subarray(
								0,
								payloadHeaderLength
							);
						}
					} else {
						throw Error("Could not parse header properly.");
					}

					if (mysqlSupportsSSL(fullPayloadBody)) {
						// Send our own fixed SSL request to MySQL server with minimal capabilities
						const sslRequestPacket = Buffer.from([
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
						]);
						await writeAsync(dbSocket, sslRequestPacket);

						// Upgrade server connection to TLS immediately
						const tlsOptions: tls.ConnectionOptions = {
							socket: dbSocket,
							host: targetHost,
							servername: targetHost,
							minVersion: "TLSv1.2",
							rejectUnauthorized: true,
						};
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
						await writeAsync(tlsSocket, Buffer.from(clientAuthPayload));

						// Read and forward server's response, and fix sequence ID byte back to client
						const authResponsePayload = await readAsync(tlsSocket);
						authResponsePayload[3]--;
						await writeAsync(clientSocket, Buffer.from(authResponsePayload));

						// Finished full handshake/auth - pipe bi-directional sockets
						clientSocket.pipe(tlsSocket);
						tlsSocket.pipe(clientSocket);
						return;
					} else {
						// Server doesn't support SSL but we require it
						if (sslmodeRequire) {
							throw Error(
								"Server does not support SSL, but client requires SSL."
							);
						}
					}
				}
			} catch (e) {
				if (sslmodeRequire) {
					// Write error to client so worker can read it
					clientSocket.write(`${e}\n`);
					clientSocket.end();
					dbSocket.destroy();
					return;
				}
				// Fall back to plain tcp
				retryConnection = true;
			}
		}

		// In the case where we attempted tls upgrade connection failed, we will reconnect with plain tcp
		if (retryConnection) {
			dbSocket = net.connect({ host: targetHost, port: targetPort });
		}

		// Pipe plain tcp sockets
		clientSocket.pipe(dbSocket);
		dbSocket.pipe(clientSocket);
	}

	async dispose(): Promise<void> {
		await Promise.all(
			Array.from(this.#servers.values()).map((server) => {
				new Promise<void>((resolve, reject) => {
					server.close((err) => (err ? reject(err) : resolve()));
				});
			})
		);
		this.#servers.clear();
	}
}

// Simple helper functions for net library
function writeAsync(
	socket: net.Socket,
	bytes: Buffer<ArrayBuffer>
): Promise<void> {
	return new Promise((resolve, reject) => {
		socket.write(bytes, (err) => (err ? reject(err) : resolve()));
	});
}

function readAsync(socket: net.Socket): Promise<Buffer<ArrayBufferLike>> {
	return new Promise((resolve) => {
		socket.once("data", (data) => resolve(data));
	});
}

function tlsConnect(options: tls.ConnectionOptions): Promise<tls.TLSSocket> {
	return new Promise((resolve, reject) => {
		const socket = tls.connect(options);

		socket.once("secureConnect", () => {
			resolve(socket);
		});

		socket.once("error", (err) => {
			reject(err);
		});
	});
}

// MySQL helper that skips through reading the init packet
// until we get to the ssl capability flag, only need to look at lower 16 bits
// docs: https://dev.mysql.com/doc/dev/mysql-server/latest/page_protocol_connection_phase_packets_protocol_handshake_v10.html
function mysqlSupportsSSL(payload: Buffer<ArrayBuffer>): boolean {
	const payloadLength = payload.length;
	let offset = 1;

	// Find end of server_version string (null terminator)
	while (offset < payloadLength && payload[offset] != 0x00) offset++;

	// Skip null terminator
	offset++;

	// Ensure ther are enough bytes left for fixed fields
	if (offset + 4 + 8 + 1 + 2 > payloadLength) return false;

	// Skip connection_id, auth_plugin_data_part_1, filler
	offset += 4;
	offset += 8;
	offset += 1;

	// Read 2-byte little-endian capability_flags_lower
	const caps = payload[offset] | (payload[offset + 1] << 8);

	// Check ssl support
	return (caps & 2048) != 0;
}
