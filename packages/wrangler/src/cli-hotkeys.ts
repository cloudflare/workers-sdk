import readline from "readline";
import { unwrapHook } from "./api/startDevWorker/utils";
import type { Hook } from "./api";
import type { Logger } from "./logger";

type KeypressEvent = { name: string; ctrl: boolean };

export default function ({
	options,
	logger,
	stdin,
}: {
	options: Array<{
		keys: string[];
		label: Hook<string>;
		handler: (helpers: {
			printIntructions: () => void;
		}) => void | Promise<void>;
	}>;
	logger: Logger;
	stdin?: typeof process.stdin;
}) {
	/**
	 * Prints all options, comma-separated, prefixed by the first key in square brackets.
	 *
	 * Example output:
	 *  ╭─────────────────────────────────────────────────────────╮
	 *  │  [a] first option, [b] second option, [c] third option  │
	 *  ╰─────────────────────────────────────────────────────────╯
	 *
	 * Limitations:
	 *  - doesn't break nicely across lines
	 */
	function printIntructions() {
		const instructions = options
			.map(({ keys, label }) => `[${keys[0]}] ${unwrapHook(label)}`)
			.join(", ");

		logger.log(
			`╭──${"─".repeat(instructions.length)}──╮\n` +
				`│  ${instructions}  │\n` +
				`╰──${"─".repeat(instructions.length)}──╯\n`
		);
	}

	printIntructions();

	return onKeyPress(async (key) => {
		key = key.toLowerCase();

		for (const { keys, handler } of options) {
			if (keys.includes(key)) {
				try {
					await handler({ printIntructions });
				} catch (error) {
					logger.error(`Error while handling hotkey [${key}]\n`, error);
				}
			}
		}
	}, stdin);
}

export function onKeyPress(
	callback: (key: string) => void,
	stdin = process.stdin
) {
	if (stdin.isTTY) {
		readline.emitKeypressEvents(stdin);
		stdin.setRawMode(true);
	}

	const handler = async (char: string, key: KeypressEvent) => {
		if (key && key.ctrl && key.name == "c") {
			char = "CTRL+C";
		}

		if (char) {
			callback(char);
		}
	};

	stdin.on("keypress", handler);

	return () => stdin.off("keypress", handler);
}
