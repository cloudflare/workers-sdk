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

	// Check if setRawMode is available (only on real TTYs)
	// Note: isInteractive() may return true via WRANGLER_FORCE_INTERACTIVE even when
	// stdin is not a real TTY, so we need to check for setRawMode availability
	const hasRawMode =
		isInteractive() && typeof process.stdin.setRawMode === "function";

	if (hasRawMode) {
		readline.emitKeypressEvents(stream);
		process.stdin.setRawMode(true);
	} else if (isInteractive()) {
		// Still emit keypress events even without raw mode
		// This allows testing with piped stdin
		readline.emitKeypressEvents(stream);
	}

	const handler = async (_char: string, key: Key) => {
		if (key) {
			callback(key);
		}
	};

	stream.on("keypress", handler);

	return () => {
		if (hasRawMode) {
			process.stdin.setRawMode(false);
		}
		stream.off("keypress", handler);
		stream.destroy();
	};
}
