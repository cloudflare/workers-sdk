import type net from "node:net";

export const POSTGRES_SSL_REQUEST_PACKET = Buffer.from([
	0x00, 0x00, 0x00, 0x08, 0x04, 0xd2, 0x16, 0x2f,
]);

/**
 * Creates a simple echo handler for PostgreSQL test servers.
 * Responds with 'N' to SSL request packets and echoes back all other data.
 */
export function createPostgresEchoHandler(
	socket: net.Socket
): (chunk: Buffer) => void {
	return (chunk: Buffer) => {
		if (POSTGRES_SSL_REQUEST_PACKET.equals(chunk)) {
			socket.write("N");
		} else {
			socket.write(chunk);
		}
	};
}
