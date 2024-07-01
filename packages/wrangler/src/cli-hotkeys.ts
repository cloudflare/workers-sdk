import readline from "readline";
import { Log } from "miniflare";
import { unwrapHook } from "./api/startDevWorker/utils";
import { Logger, logger } from "./logger";
import { onKeyPress } from "./utils/onKeyPress";
import type { Hook } from "./api";

export default function (
	options: Array<{
		keys: string[];
		label: Hook<string>;
		handler: () => void | Promise<void>;
	}>
) {
	/**
	 * Formats all options, comma-separated, prefixed by the first key in square brackets.
	 *
	 * Example output:
	 *  ╭─────────────────────────────────────────────────────────╮
	 *  │  [a] first option, [b] second option, [c] third option  │
	 *  ╰─────────────────────────────────────────────────────────╯
	 *
	 * Limitations:
	 *  - doesn't break nicely across lines
	 */
	function formatInstructions() {
		const instructions = options
			.map(({ keys, label }) => `[${keys[0]}] ${unwrapHook(label)}`)
			.join(", ");

		return (
			`╭──${"─".repeat(instructions.length)}──╮\n` +
			`│  ${instructions}  │\n` +
			`╰──${"─".repeat(instructions.length)}──╯`
		);
	}

	const unregisterKeyPress = onKeyPress(async (key) => {
		let char = key.name.toLowerCase();

		if (key?.meta) {
			char = "meta+" + char;
		}
		if (key?.ctrl) {
			char = "ctrl+" + char;
		}
		if (key?.shift) {
			char = "shift+" + char;
		}

		for (const { keys, handler } of options) {
			if (keys.includes(char)) {
				try {
					await handler();
				} catch {
					logger.error(`Error while handling hotkey [${char}]`);
				}
			}
		}
	});

	let previousInstructionsLineCount = 0;
	function clearPreviousInstructions() {
		if (previousInstructionsLineCount) {
			readline.moveCursor(process.stdout, 0, -previousInstructionsLineCount);
			readline.clearScreenDown(process.stdout);
		}
	}
	function printInstructions() {
		const bottomFloat = formatInstructions();
		if (bottomFloat) {
			console.log(bottomFloat);
			previousInstructionsLineCount = bottomFloat.split("\n").length;
		}
	}

	Logger.registerBeforeLogHook(clearPreviousInstructions);
	Logger.registerAfterLogHook(printInstructions);
	Log.unstable_registerBeforeLogHook(clearPreviousInstructions);
	Log.unstable_registerAfterLogHook(printInstructions);

	return () => {
		unregisterKeyPress();
		// clearPreviousInstructions();
		Logger.registerBeforeLogHook(undefined);
		Logger.registerAfterLogHook(undefined);
		Log.unstable_registerBeforeLogHook(undefined);
		Log.unstable_registerAfterLogHook(undefined);
	};
}
