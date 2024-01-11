import assert from "node:assert";
import { MessageChannel, receiveMessageOnPort } from "node:worker_threads";
import type { WorkersProjectOptions } from "../pool/config";
import type { Awaitable, inject } from "vitest";

// Vitest will call `structuredClone()` to verify data is serialisable.
// `structuredClone()` was only added to the global scope in Node 17.
// TODO(now): make Node 18 the minimum supported version
let channel: MessageChannel;
globalThis.structuredClone ??= function (value, options) {
	// https://github.com/nodejs/node/blob/71951a0e86da9253d7c422fa2520ee9143e557fa/lib/internal/structured_clone.js
	channel ??= new MessageChannel();
	channel.port1.unref();
	channel.port2.unref();
	channel.port1.postMessage(value, options?.transfer);
	const message = receiveMessageOnPort(channel.port2);
	assert(message !== undefined);
	return message.message;
};

export interface WorkerPoolOptionsContext {
	// For accessing values from `globalSetup()` (e.g. ports servers started on)
	// in Miniflare options (e.g. bindings, upstream, hyperdrives, ...)
	inject: typeof inject;
}

export function defineWorkersPoolOptions(
	options:
		| WorkersProjectOptions
		| ((ctx: WorkerPoolOptionsContext) => Awaitable<WorkersProjectOptions>)
) {
	return options;
}

// TODO(soon): runD1Migrations()
// TODO(soon): getPagesASSETSBinding()

export { kCurrentWorker } from "miniflare";
