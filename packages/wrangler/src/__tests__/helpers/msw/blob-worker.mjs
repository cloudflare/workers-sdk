import { workerData } from "worker_threads";

const { shared, blob, port } = workerData;

port.postMessage({
	body: await blob.arrayBuffer(),
});

const int32 = new Int32Array(shared);
Atomics.notify(int32, 0);
