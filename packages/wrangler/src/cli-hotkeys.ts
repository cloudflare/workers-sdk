import readline from "readline";
import { Log } from "miniflare";
import { unwrapHook } from "./api/startDevWorker/utils";
import { Logger, logger } from "./logger";
import { onKeyPress } from "./utils/onKeyPress";
import type { Hook } from "./api";

export default function (
	options: Array<{
		keys: string[];
		disabled?: Hook<boolean>;
		label: Hook<string>;
		handler: () => void | Promise<void>;
	}>
) {
	/**
	 * Formats all options, comma-separated, prefixed by the first key in square brackets.
	 *
	 * Example output (wide screen):
	 *  ╭─────────────────────────────────────────────────────────╮
	 *  │  [a] first option, [b] second option, [c] third option  │
	 *  ╰─────────────────────────────────────────────────────────╯
	 *
	 * Example output (narrow screen):
	 *
	 *  ╭──────────────────────╮
	 *  │  [a] first option,   |
	 *  |  [b] second option   |
	 *  |  [c] third option    │
	 *  ╰──────────────────────╯
	 *
	 */
	function formatInstructions() {
		const instructions = options
			.filter((option) => !unwrapHook(option.disabled))
			.map(({ keys, label }) => `[${keys[0]}] ${unwrapHook(label)}`);

		let stringifiedInstructions = instructions.join(", ");

		const ADDITIONAL_CHARS = 6; // 3 chars on each side of the instructions for the box and spacing ("│  " and "  │")
		const willWrap =
			stringifiedInstructions.length + ADDITIONAL_CHARS >
			process.stdout.columns;
		if (willWrap) {
			stringifiedInstructions = instructions.join("\n");
		}

		const maxLineLength = Math.max(
			...stringifiedInstructions.split("\n").map((line) => line.length)
		);

		stringifiedInstructions = stringifiedInstructions
			.split("\n")
			.map((line) => `│  ${line.padEnd(maxLineLength, " ")}  │`)
			.join("\n");

		return (
			`╭──${"─".repeat(maxLineLength)}──╮\n` +
			stringifiedInstructions +
			`\n╰──${"─".repeat(maxLineLength)}──╯`
		);
	}

	const unregisterKeyPress = onKeyPress(async (key) => {
		const entries: string[] = [];

		if (key.name) {
			entries.push(key.name.toLowerCase());
		}
		if (key.meta) {
			entries.unshift("meta");
		}
		if (key.ctrl) {
			entries.unshift("ctrl");
		}
		if (key.shift) {
			entries.unshift("shift");
		}

		const char = entries.join("+");

		for (const { keys, handler, disabled } of options) {
			if (unwrapHook(disabled)) {
				continue;
			}

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
	printInstructions();

	return () => {
		unregisterKeyPress();
		clearPreviousInstructions();
		Logger.registerBeforeLogHook(undefined);
		Logger.registerAfterLogHook(undefined);
		Log.unstable_registerBeforeLogHook(undefined);
		Log.unstable_registerAfterLogHook(undefined);
	};
}
