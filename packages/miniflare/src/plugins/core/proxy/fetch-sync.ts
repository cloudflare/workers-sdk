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
  if (dispatcherUrl !== url) {
    dispatcherUrl = url;
    dispatcher = new Pool(url, {
      connect: { rejectUnauthorized: false },
    });
  }
  headers["${CoreHeaders.OP_SYNC}"] = "true";
  try {
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
  }
  Atomics.store(notifyHandle, /* index */ 0, /* value */ 1);
  Atomics.notify(notifyHandle, /* index */ 0);
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
		if (this.#worker !== undefined) return;
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
		Atomics.store(this.#notifyHandle, /* index */ 0, /* value */ 0);
		const id = this.#nextId++;
		this.#channel.port1.postMessage({
			id,
			method: init.method,
			url: url.toString(),
			headers: init.headers,
			body: init.body,
		});
		// If index 0 contains value 0, block until wake-up notification
		Atomics.wait(this.#notifyHandle, /* index */ 0, /* value */ 0);
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
