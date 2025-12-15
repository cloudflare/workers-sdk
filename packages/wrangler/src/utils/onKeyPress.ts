import readline from "node:readline";
import { PassThrough } from "node:stream";
import isInteractive from "../is-interactive";
import type { Key } from "node:readline";

export function onKeyPress(callback: (key: Key) => void) {
	// Listening for events on process.stdin (eg .on('keypress')) causes it to go into 'old mode'
	// which keeps this nodejs process alive even after calling .off('keypress')
	// WORKAROUND: piping stdin via a transform stream allows us to call stream.destroy()
	// which then allows this nodejs process to close cleanly
	// https://nodejs.org/api/process.html#signal-events:~:text=be%20used%20in-,%22old%22%20mode,-that%20is%20compatible
	const stream = new PassThrough();
	process.stdin.pipe(stream);

	if (isInteractive()) {
		readline.emitKeypressEvents(stream);
		process.stdin.setRawMode(true);
	}

	const handler = async (_char: string, key: Key) => {
		if (key) {
			callback(key);
		}
	};

	stream.on("keypress", handler);

	return () => {
		if (isInteractive()) {
			process.stdin.setRawMode(false);
		}
		stream.off("keypress", handler);
		stream.destroy();
	};
}
