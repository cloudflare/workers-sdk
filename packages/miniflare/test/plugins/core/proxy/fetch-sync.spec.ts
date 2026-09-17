import { MessageChannel, Worker } from "node:worker_threads";
import { test, vi } from "vitest";
import { receiveReply } from "../../../../src/plugins/core/proxy/fetch-sync";

vi.mock("../../../../src/plugins/core/errors", () => ({
	JsonErrorSchema: {},
	reviveError: () => undefined,
}));

const REPLY_WORKER_SCRIPT = /* javascript */ `
const { parentPort, workerData } = require("node:worker_threads");
const { id, notifyHandle, port, staleWakeCount, startHandle } = workerData;

parentPort.postMessage("ready");
Atomics.wait(startHandle, /* index */ 0, /* value */ 0);

let staleWakes = 0;
while (staleWakes < staleWakeCount) {
  if (Atomics.notify(notifyHandle, /* index */ 0) === 1) {
    staleWakes++;
  }
}
parentPort.postMessage(staleWakes);

// Match the production protocol's ordering manually: queue the reply before
// publishing its generation. This exercises receiveReply(), not the real worker.
port.postMessage({
  id,
  response: {
    status: 204,
    headers: { "x-test": "reply" },
    body: null,
  },
});
Atomics.store(notifyHandle, /* index */ 0, /* generation */ (id + 1) | 0);
Atomics.notify(notifyHandle, /* index */ 0);
port.close();
`;

function waitForMessage<T>(worker: Worker): Promise<T> {
	return new Promise((resolve, reject) => {
		worker.once("message", resolve);
		worker.once("error", reject);
	});
}

function waitForExit(worker: Worker): Promise<number> {
	return new Promise((resolve, reject) => {
		worker.once("exit", resolve);
		worker.once("error", reject);
	});
}

async function startReplyWorker(
	id: number,
	initialGeneration: number,
	staleWakeCount: number
) {
	const channel = new MessageChannel();
	const notifyHandle = new Int32Array(new SharedArrayBuffer(4));
	const startHandle = new Int32Array(new SharedArrayBuffer(4));
	Atomics.store(notifyHandle, /* index */ 0, initialGeneration);

	const worker = new Worker(REPLY_WORKER_SCRIPT, {
		eval: true,
		workerData: {
			id,
			notifyHandle,
			port: channel.port2,
			staleWakeCount,
			startHandle,
		},
		transferList: [channel.port2],
	});
	const exited = waitForExit(worker);
	await waitForMessage(worker);
	const staleWakes = waitForMessage<number>(worker);
	Atomics.store(startHandle, /* index */ 0, /* value */ 1);
	Atomics.notify(startHandle, /* index */ 0);
	return { channel, exited, notifyHandle, staleWakes };
}

test("receives a matching reply after its generation is published", async ({
	expect,
}) => {
	const id = 0;
	const { channel, exited, notifyHandle, staleWakes } = await startReplyWorker(
		id,
		/* initialGeneration */ 0,
		/* staleWakeCount */ 0
	);

	const reply = receiveReply(notifyHandle, channel.port1, id);

	expect(reply).toEqual({
		id,
		response: {
			status: 204,
			headers: { "x-test": "reply" },
			body: null,
		},
	});
	expect(await staleWakes).toBe(0);
	expect(await exited).toBe(0);
	channel.port1.close();
});

test("absorbs stale notifications until the requested generation is published", async ({
	expect,
}) => {
	const id = 1;
	const { channel, exited, notifyHandle, staleWakes } = await startReplyWorker(
		id,
		/* initialGeneration */ 0,
		/* staleWakeCount */ 2
	);

	// Regression for .changeset/quiet-otters-handshake.md: the first stale notify
	// wakes receiveReply() with an empty queue. Requiring a second confirmed wake
	// proves it re-checked the generation and armed another wait instead of reading.
	const reply = receiveReply(notifyHandle, channel.port1, id);

	expect(await staleWakes).toBe(2);
	expect(reply).toEqual({
		id,
		response: {
			status: 204,
			headers: { "x-test": "reply" },
			body: null,
		},
	});
	expect(await exited).toBe(0);
	channel.port1.close();
});
