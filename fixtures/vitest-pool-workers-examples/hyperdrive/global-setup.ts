import type { GlobalSetupContext } from "vitest/node";

import assert from "node:assert";
import events from "node:events";
import net from "node:net";
import util from "node:util";

// Global setup runs inside Node.js, not `workerd`
export default async function ({ provide }: GlobalSetupContext) {
	// Start echo server on random port
	const server = net.createServer((socket) => socket.pipe(socket));
	const listeningPromise = events.once(server, "listening");
	server.listen(0, "127.0.0.1");
	await listeningPromise;

	// Get randomly assigned port and provide for config
	const address = server.address();
	assert(typeof address === "object" && address !== null);
	const port = address.port;
	provide("echoServerPort", port);
	console.log(`Started echo server on port ${port}`);

	return async () => {
		// Stop echo server on teardown
		await util.promisify(server.close.bind(server))();
		console.log("Stopped echo server");
	};
}
