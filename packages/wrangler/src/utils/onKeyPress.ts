import readline from "readline";
import { PassThrough } from "stream";
import { isNonInteractiveOrCI } from "../is-interactive";

export type KeypressEvent = {
	name: string;
	sequence: string;
	ctrl: boolean;
	meta: boolean;
	shift: boolean;
};

export function onKeyPress(callback: (key: KeypressEvent) => void) {
	// Listening for events on process.stdin (eg .on('keypress')) causes it to go into 'old mode'
	// which keeps this nodejs process alive even after calling .off('keypress')
	// WORKAROUND: piping stdin via a transform stream allows us to call stream.destroy()
	// which then allows this nodejs process to close cleanly
	// https://nodejs.org/api/process.html#signal-events:~:text=be%20used%20in-,%22old%22%20mode,-that%20is%20compatible
	const stream = new PassThrough();
	process.stdin.pipe(stream);

	if (!isNonInteractiveOrCI()) {
		readline.emitKeypressEvents(stream);
		process.stdin.setRawMode(true);
	}

	const handler = async (_char: string, key: KeypressEvent) => {
		if (key) {
			callback(key);
		}
	};

	stream.on("keypress", handler);

	return () => {
		if (!isNonInteractiveOrCI()) {
			process.stdin.setRawMode(false);
		}
		stream.off("keypress", handler);
		stream.destroy();
	};
}
