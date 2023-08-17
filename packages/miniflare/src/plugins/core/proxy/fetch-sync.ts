import assert from "assert";
import { ReadableStream } from "stream/web";
import { MessageChannel, Worker, receiveMessageOnPort } from "worker_threads";
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
const { workerData } = require("worker_threads");
const { Client, fetch } = require("undici");

// Not using parentPort here so we can call receiveMessageOnPort() in host
const { notifyHandle, port } = workerData;

let clientUrl;
let client;

port.addEventListener("message", async (event) => {
  const { id, method, url, headers, body } = event.data;
  if (clientUrl !== url) {
    clientUrl = url;
    client = new Client(url, {
      connect: { rejectUnauthorized: false },
    });
  }
  headers["${CoreHeaders.OP_SYNC}"] = "true";
  try {
    // body cannot be a ReadableStream, so no need to specify duplex
    const response = await fetch(url, { method, headers, body, dispatcher: client });
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
