import assert from "node:assert";
import { TextDecoder } from "node:util";
import { Worker } from "node:worker_threads";
import { test, vi } from "vitest";
import { SynchronousFetcher } from "../../../../src/plugins/core/proxy/fetch-sync";

// Avoid pulling in `src/plugins/core/index.ts` (and its `worker:` imports)
vi.mock("../../../../src/plugins/core/errors", () => ({
	JsonErrorSchema: {},
	reviveError: () => undefined,
}));

// Regression test for https://github.com/cloudflare/workers-sdk/issues/16445.
//
// workerd closes an idle keep-alive connection 5s after its last response (the
// kj `HttpServer` pipeline timeout, which can't be configured). If workerd is
// descheduled past that deadline, it wakes with the timer already overdue and
// closes the socket *without reading* any request that was written into it, so
// the caller sees `fetch failed` caused by `read ECONNRESET`.
//
// The `SynchronousFetcher`'s undici `Pool` reuses keep-alive sockets
// indefinitely (no `pipelining`/`keepAliveTimeout` options), so a synchronous
// proxy call can have its request written into a connection the server is about
// to close unread, instead of opening a fresh connection.
//
// Reproducing this against real workerd needs the child process to be
// `SIGSTOP`ed, and which side wins when it wakes (the overdue idle timer or
// the pending request) is a scheduling race. So this test drives
// `SynchronousFetcher` directly against a server that emulates the workerd
// behaviour the issue documents: it keeps the connection alive and pooled
// after the first response, then closes it without reading the request that
// was written into it. With connection reuse, the second synchronous fetch
// dies with `ECONNRESET`; without it, the fetch opens a fresh connection and
// succeeds.

// Runs in a worker thread: the synchronous fetch below blocks the main thread,
// so the server needs its own event loop to close the connection while the
// request is in flight
const SERVER_WORKER_SCRIPT = /* javascript */ `
const net = require("node:net");
const { parentPort, workerData } = require("node:worker_threads");

let armed = false;

const server = net.createServer((socket) => {
  let headers = "";
  socket.on("data", (chunk) => {
    headers += chunk;
    if (!headers.includes("\\r\\n\\r\\n")) {
      return;
    }
    headers = "";
    // Reply with a keep-alive response, so undici pools the connection
    socket.write(
      "HTTP/1.1 200 OK\\r\\n" +
      "Content-Length: 2\\r\\n" +
      "Connection: keep-alive\\r\\n" +
      "\\r\\n" +
      "ok"
    );
    if (!armed) {
      armed = true;
      parentPort.postMessage("served");
      // Emulate workerd's overdue idle keep-alive close: stop reading, so the
      // next request written into this connection sits unread, then close it
      socket.pause();
      setTimeout(() => socket.destroy(), workerData.closeAfterMs);
    }
  });
});
server.listen(0, "127.0.0.1", () => {
  parentPort.postMessage(server.address().port);
});
`;

function waitForMessage<T>(worker: Worker): Promise<T> {
	return new Promise((resolve, reject) => {
		worker.once("message", resolve);
		worker.once("error", reject);
	});
}

const DECODER = new TextDecoder();

test("synchronous fetches survive the server closing a pooled idle connection with a request in flight", async () => {
	const server = new Worker(SERVER_WORKER_SCRIPT, {
		eval: true,
		workerData: { closeAfterMs: 300 },
	});
	const port = await waitForMessage<number>(server);
	const url = `http://127.0.0.1:${port}/`;

	const fetcher = new SynchronousFetcher();
	try {
		await fetcher.warm();

		// First fetch: response is keep-alive, so undici pools the connection
		const first = fetcher.fetch(url, { method: "GET", headers: {} });
		assert.strictEqual(DECODER.decode(first.body as ArrayBuffer), "ok");
		// Server has replied, paused the connection, and armed its close
		await waitForMessage(server);

		// Second fetch: written into the pooled connection the server closes
		// unread. With the reported bug, this fails with `fetch failed`
		// caused by `read ECONNRESET`.
		const second = fetcher.fetch(url, { method: "GET", headers: {} });
		assert.strictEqual(DECODER.decode(second.body as ArrayBuffer), "ok");
	} finally {
		await fetcher.dispose();
		await server.terminate();
	}
});
