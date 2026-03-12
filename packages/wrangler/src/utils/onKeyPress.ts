import readline from "node:readline";
import { PassThrough } from "node:stream";
import isInteractive from "../is-interactive";
import type { Key } from "node:readline";

type OnKeyPressOptions = {
	/**
	 * Timeout in ms for disambiguating a standalone Esc press from the
	 * start of a multi-byte escape sequence (e.g. arrow keys send
	 * \x1b[A). readline's default is 500ms. Set this to a lower value
	 * (e.g. 25) for near-instant Esc detection. When omitted,
	 * readline's built-in default is used.
	 */
	escapeCodeTimeout?: number;
};

export function onKeyPress(
	callback: (key: Key) => void,
	options?: OnKeyPressOptions
) {
	// Listening for events on process.stdin (eg .on('keypress')) causes it to go into 'old mode'
	// which keeps this nodejs process alive even after calling .off('keypress')
	// WORKAROUND: piping stdin via a transform stream allows us to call stream.destroy()
	// which then allows this nodejs process to close cleanly
	// https://nodejs.org/api/process.html#signal-events:~:text=be%20used%20in-,%22old%22%20mode,-that%20is%20compatible
	const stream = new PassThrough();
	process.stdin.pipe(stream);

	let rl: readline.Interface | undefined;

	if (isInteractive()) {
		rl = readline.createInterface({
			input: stream,
			...options,
		});

		readline.emitKeypressEvents(stream, rl);
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
		rl?.close();
		stream.off("keypress", handler);
		stream.destroy();
	};
}
