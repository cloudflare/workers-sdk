/*! Read blob sync in NodeJS. MIT License. Jimmy Wärting <https://jimmy.warting.se/opensource>
 * Special Thanks to Jimmy Wärting helping in https://github.com/nodejs/undici/issues/1830
 */
const { join } = require("path");
const {
	Worker,
	receiveMessageOnPort,
	MessageChannel,
} = require("worker_threads");

/**
 * blob-worker & read-file-sync are part of a polyfill to synchronously read a blob in NodeJS
 * this is needed for MSW FormData patching to work and support Blobs, serializing them to a string before recreating the FormData.
 */
function read(blob) {
	const subChannel = new MessageChannel();
	const signal = new Int32Array(new SharedArrayBuffer(4));
	signal[0] = 0;

	const path = join(__dirname, "blob-worker.cjs");

	const worker = new Worker(path, {
		transferList: [subChannel.port1],
		workerData: {
			signal,
			port: subChannel.port1,
			blob,
		},
	});

	// Sleep until the other thread sets signal[0] to 1
	Atomics.wait(signal, 0, 0);

	// Close the worker thread
	worker.terminate();

	return receiveMessageOnPort(subChannel.port2)?.message;
}

class FileReaderSync {
	readAsArrayBuffer(blob) {
		this.result = read(blob);
	}

	readAsDataURL(blob) {
		const ab = read(blob);
		this.result = `data:${blob.type};base64,${Buffer.from(ab).toString(
			"base64"
		)}`;
	}

	readAsText(blob) {
		const ab = read(blob);
		this.result = new TextDecoder().decode(ab);
	}

	// Should not be used, use readAsArrayBuffer instead
	// readAsBinaryString(blob) { ... }
}

exports.FileReaderSync = FileReaderSync;
