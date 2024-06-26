import { unwrapHook } from "./api/startDevWorker/utils";
import { logger } from "./logger";
import { onKeyPress } from "./utils/onKeyPress";
import type { Hook } from "./api";

export default function (
	options: Array<{
		keys: string[];
		label: Hook<string>;
		handler: (helpers: {
			printInstructions: () => void;
		}) => void | Promise<void>;
	}>
) {
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
	function printInstructions() {
		const instructions = options
			.map(({ keys, label }) => `[${keys[0]}] ${unwrapHook(label)}`)
			.join(", ");

		logger.log(
			`╭──${"─".repeat(instructions.length)}──╮\n` +
				`│  ${instructions}  │\n` +
				`╰──${"─".repeat(instructions.length)}──╯\n`
		);
	}

	printInstructions();

	return onKeyPress(async (key) => {
		key = key.toLowerCase();

		for (const { keys, handler } of options) {
			if (keys.includes(key)) {
				try {
					await handler({ printInstructions });
				} catch {
					logger.error(`Error while handling hotkey [${key}]`);
				}
			}
		}
	});
}
