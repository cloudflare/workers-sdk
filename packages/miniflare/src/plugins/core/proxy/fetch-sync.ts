import assert from "node:assert";
import { ReadableStream } from "node:stream/web";
import {
	MessageChannel,
	receiveMessageOnPort,
	Worker,
} from "node:worker_threads";
import { Headers } from "../../../http";
import { CoreHeaders } from "../../../workers";
import { JsonErrorSchema, reviveError } from "../errors";

export const DECODER = new TextDecoder();

export interface SynchronousRequestInit {
	method?: string;
	headers?: Record<string, string>;
	// `body` cannot be a `ReadableStream`, as we're blocking the main thread, so
	// chunks could never be read until after the response was received, leading
	// to deadlock
	body?: ArrayBuffer | NodeJS.ArrayBufferView | string | null;
}
export interface SynchronousResponse<H = Headers> {
	status: number;
	headers: H;
	// `ReadableStream` returned if `CoreHeaders.OP_RESULT_TYPE` header is
	// `ReadableStream`. In that case, we'll return the `ReadableStream` directly.
	body: ReadableStream | ArrayBuffer | null;
}

type WorkerResponse = { id: number } & (
	| { response: SynchronousResponse<Record<string, string>> }
	| { error: unknown }
);

const WORKER_SCRIPT = /* javascript */ `
const { createRequire } = require("module");
const { workerData } = require("worker_threads");

// Not using parentPort here so we can call receiveMessageOnPort() in host
const { notifyHandle, port, filename } = workerData;

// When running Miniflare from Jest, regular 'require("undici")' will fail here
// with "Error: Cannot find module 'undici'". Instead we need to create a
// 'require' using the '__filename' of the host... :(
const actualRequire = createRequire(filename);
const { Pool, fetch } = actualRequire("undici");

let dispatcherUrl;
let dispatcher;

port.addEventListener("message", async (event) => {
  const { id, method, url, headers, body } = event.data;
  try {
    if (dispatcherUrl !== url) {
      dispatcherUrl = url;
      dispatcher = new Pool(new URL(url).origin, {
        connect: { rejectUnauthorized: false },
              // Disable timeouts for local dev — long-running responses (streaming,
      // slow uploads, long-polling) should not be killed by undici defaults.
      headersTimeout: 0,
      bodyTimeout: 0,
      });
    }
    headers["${CoreHeaders.OP_SYNC}"] = "true";
    // body cannot be a ReadableStream, so no need to specify duplex
    const response = await fetch(url, { method, headers, body, dispatcher });
    const responseBody = response.headers.get("${CoreHeaders.OP_RESULT_TYPE}") === "ReadableStream"
      ? response.body
      : await response.arrayBuffer();
    const transferList = responseBody === null ? undefined : [responseBody];
    port.postMessage(
      {
        id,
        response: {
          status: response.status,
          headers: Object.fromEntries(response.headers),
          body: responseBody,
        }
      },
      transferList
    );
  } catch (error) {
    try {
      port.postMessage({ id, error });
    } catch {
      // If error failed to serialise, post simplified version
      port.postMessage({ id, error: new Error(String(error)) });
    }
  } finally {
    // Publish THIS request's generation (never 0), not a bare flag: see fetch()
    Atomics.store(notifyHandle, /* index */ 0, /* generation */ (id + 1) | 0);
    Atomics.notify(notifyHandle, /* index */ 0);
  }
});

port.start();
`;

// Ideally we would just have a single, shared `unref()`ed `Worker`, and an
// exported `fetchSync()` method. However, if a `ReadableStream` is transferred
// from the worker, and not consumed, it will prevent the process from exiting.
// Since we'll pass some of these `ReadableStream`s directly to users (e.g.
// `R2ObjectBody#body`), we can't guarantee they'll all be consumed. Therefore,
// we create a new `SynchronousFetcher` instance per `Miniflare` instance, and
// clean it up on `Miniflare#dispose()`, allowing the process to exit cleanly.
export class SynchronousFetcher {
	readonly #channel: MessageChannel;
	readonly #notifyHandle: Int32Array;
	#worker?: Worker;
	#nextId = 0;

	constructor() {
		this.#channel = new MessageChannel();
		this.#notifyHandle = new Int32Array(new SharedArrayBuffer(4));
	}

	#ensureWorker() {
		if (this.#worker !== undefined) {
			return;
		}
		this.#worker = new Worker(WORKER_SCRIPT, {
			eval: true,
			workerData: {
				notifyHandle: this.#notifyHandle,
				port: this.#channel.port2,
				filename: __filename,
			},
			transferList: [this.#channel.port2],
		});
	}

	fetch(url: URL | string, init: SynchronousRequestInit): SynchronousResponse {
		this.#ensureWorker();
		const id = this.#nextId++;
		// Each request owns a generation (`id + 1`, never 0) that the worker stores
		// once its reply is in `port1`'s queue. A shared 0/1 flag raced: a reply's
		// `store(1)` could land before our `Atomics.wait` (which then returned
		// "not-equal" at once) while its `Atomics.notify` landed after the NEXT
		// request had armed its wait. That wait woke to an empty queue, the
		// `assert` below threw, and every later call received the previous
		// call's reply (a preempted worker thread under a contended CI runner).
		const generation = (id + 1) | 0;
		this.#channel.port1.postMessage({
			id,
			method: init.method,
			url: url.toString(),
			headers: init.headers,
			body: init.body,
		});
		// Block until the worker has published THIS request's generation. A stale
		// notify from the previous reply wakes us early, so re-check and wait
		// again; the store follows the reply's `postMessage`, so once the
		// generation is seen the reply is already in `port1`'s queue.
		for (
			let seen = Atomics.load(this.#notifyHandle, /* index */ 0);
			seen !== generation;
			seen = Atomics.load(this.#notifyHandle, /* index */ 0)
		) {
			Atomics.wait(this.#notifyHandle, /* index */ 0, seen);
		}
		// Never yielded to the event loop here, and we're the only ones with access
		// to port1, so know this message is for this request
		const message: WorkerResponse | undefined = receiveMessageOnPort(
			this.#channel.port1
		)?.message;
		assert(message?.id === id);
		if ("response" in message) {
			const { status, headers: rawHeaders, body } = message.response;
			const headers = new Headers(rawHeaders);
			const stack = headers.get(CoreHeaders.ERROR_STACK);
			if (status === 500 && stack !== null && body !== null) {
				// `CoreHeaders.ERROR_STACK` header should never be set with
				// `CoreHeaders.OP_RESULT_TYPE: ReadableStream`
				assert(!(body instanceof ReadableStream));
				const caught = JsonErrorSchema.parse(JSON.parse(DECODER.decode(body)));
				// No need to specify `workerSrcOpts` here assuming we only
				// synchronously fetch from internal Miniflare code (e.g. proxy server)
				throw reviveError([], caught);
			}
			// TODO(soon): add support for MINIFLARE_ASSERT_BODIES_CONSUMED here
			return { status, headers, body };
		} else {
			throw message.error;
		}
	}

	async dispose() {
		await this.#worker?.terminate();
	}
}
