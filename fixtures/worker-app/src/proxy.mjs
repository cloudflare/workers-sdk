import { connect, createServer } from "node:net";

const hostname = "127.0.0.1";
const port = 3000;

const proxy = createServer((socket) => {
	let connectedWorker = "";
	let serverSocket;

	socket.addListener("data", (d) => {
		console.log("DATA");
		if (!connectedWorker && !serverSocket) {
			let chunk = d.toString();
			let buffer;
			if (chunk.startsWith("CONNECT")) {
				// this is a JSRPC connection, get the worker name from the capnpConnectHost

				const workerName = chunk.match(
					/CONNECT miniflare-unsafe-internal-capnp-connect-(.+) HTTP\/1\.1/
				);
				console.log(chunk);
				connectedWorker = workerName[1];

				buffer = Buffer.alloc(d.length - connectedWorker.length - 1);
				d.copy(
					buffer,
					0,
					0,
					"CONNECT miniflare-unsafe-internal-capnp-connect".length
				);
				d.copy(
					buffer,
					"CONNECT miniflare-unsafe-internal-capnp-connect".length,
					"CONNECT miniflare-unsafe-internal-capnp-connect".length +
						connectedWorker.length +
						1
				);
			} else {
				// this is an HTTP connection, get the worker name from the X-Worker header
				const workerName = chunk.match(/X-Worker: (.+)\r\n/);
				connectedWorker = workerName[1];

				buffer = d;
			}
			console.log("Proxying to address of Worker", connectedWorker);
			// TODO: look up this address dynamically in the dev registry
			serverSocket = connect(56969, "127.0.0.1", () => {
				serverSocket.write(buffer);
				serverSocket.pipe(socket);
			});
		} else {
			serverSocket.write(d);
		}
	});
});

proxy.listen(port, hostname, () => {
	console.log("opened server on", proxy.address());
});
