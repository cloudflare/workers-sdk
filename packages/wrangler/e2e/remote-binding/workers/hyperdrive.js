export default {
	async fetch(request, env) {
		// Open a raw TCP connection through the binding and read the server
		// greeting. Getting a MySQL handshake back proves the whole path works:
		// credentials were seeded from the edge session, the local bridge relayed
		// the bytes, and the edge Hyperdrive proxy accepted the connection. The
		// greeting comes from Hyperdrive's own proxy rather than the origin, which
		// is exactly the hop this test is here to cover. Asserting on it instead of
		// running a query keeps the test free of a database driver dependency.
		const socket = env.HYPERDRIVE_BINDING.connect(
			`${env.HYPERDRIVE_BINDING.host}:${env.HYPERDRIVE_BINDING.port}`
		);
		try {
			const reader = socket.readable.getReader();
			const { value } = await reader.read();
			// A MySQL handshake packet is: 3-byte length, 1-byte sequence id, then
			// the protocol version (10), then a NUL-terminated version string.
			const protocolVersion = value[4];
			const end = value.indexOf(0, 5);
			const serverVersion = new TextDecoder().decode(value.slice(5, end));
			return Response.json({
				protocolVersion,
				serverVersion,
				database: env.HYPERDRIVE_BINDING.database,
			});
		} finally {
			await socket.close().catch(() => {});
		}
	},
};
