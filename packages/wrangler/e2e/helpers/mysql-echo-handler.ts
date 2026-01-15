import type net from "node:net";

/**
 * MySQL initial handshake packet (protocol version 10).
 * This is a minimal handshake packet that tells clients we're ready to accept connections.
 * Format: https://dev.mysql.com/doc/dev/mysql-server/latest/page_protocol_connection_phase_packets_protocol_handshake_v10.html
 */
export const MYSQL_INITIAL_HANDSHAKE_PACKET = Buffer.from([
	// Packet length (3 bytes) - 45 bytes payload
	0x2d, 0x00, 0x00,
	// Packet sequence number
	0x00,
	// Protocol version (10)
	0x0a,
	// Server version string "5.7.0" + null terminator
	0x35, 0x2e, 0x37, 0x2e, 0x30, 0x00,
	// Connection ID (4 bytes)
	0x01, 0x00, 0x00, 0x00,
	// Auth plugin data part 1 (8 bytes) - random bytes
	0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
	// Filler byte
	0x00,
	// Capability flags lower 2 bytes (CLIENT_PROTOCOL_41 | CLIENT_SECURE_CONNECTION)
	0x00,
	0x82,
	// Character set (utf8mb4)
	0x21,
	// Status flags (2 bytes)
	0x02, 0x00,
	// Capability flags upper 2 bytes
	0x00, 0x00,
	// Auth plugin data length (0 since we use old auth)
	0x00,
	// Reserved (10 bytes of zeros)
	0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
	// Auth plugin data part 2 (at least 13 bytes, null-terminated)
	0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x10, 0x11, 0x12, 0x13, 0x14, 0x00,
]);

/**
 * Creates a simple echo handler for MySQL test servers.
 * Sends initial handshake on connection, then echoes back all data.
 */
export function createMysqlEchoHandler(
	socket: net.Socket
): (chunk: Buffer) => void {
	return (chunk: Buffer) => {
		// Echo back all data received from the client
		socket.write(chunk);
	};
}

/**
 * Sets up a MySQL test server that sends initial handshake and then echoes data.
 */
export function setupMysqlServer(server: net.Server): void {
	server.on("connection", (socket) => {
		// MySQL server sends handshake first
		socket.write(MYSQL_INITIAL_HANDSHAKE_PACKET);
		socket.on("data", createMysqlEchoHandler(socket));
	});
}
