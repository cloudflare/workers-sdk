/*! Read blob sync in NodeJS. MIT License. Jimmy Wärting <https://jimmy.warting.se/opensource>
 * Special Thanks to Jimmy Wärting helping in https://github.com/nodejs/undici/issues/1830
 */

const { workerData } = require("worker_threads");

const { signal, port, blob } = workerData;

blob.arrayBuffer().then((ab) => {
	// Post the result back to the main thread before unlocking 'signal'
	port.postMessage(ab, [ab]);
	port.close();

	// Change the value of signal[0] to 1
	Atomics.store(signal, 0, 1);

	// This will unlock the main thread when we notify it
	Atomics.notify(signal, 0);
});
