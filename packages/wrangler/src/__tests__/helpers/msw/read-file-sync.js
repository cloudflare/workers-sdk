import { join } from "path";

const {
	Worker,
	receiveMessageOnPort,
	MessageChannel,
} = require("worker_threads");

export function FileReaderSync(blob) {
	const shared = new SharedArrayBuffer(4);
	const { port1: localPort, port2: workerPort } = new MessageChannel();

	const path = join(__dirname, "blob-worker.mjs");

	const w = new Worker(path, {
		workerData: { shared, blob, port: workerPort },
		transferList: [workerPort],
	});

	const int32 = new Int32Array(shared);
	Atomics.wait(int32, 0, 0);

	const { message } = receiveMessageOnPort(localPort);

	return message;
}
