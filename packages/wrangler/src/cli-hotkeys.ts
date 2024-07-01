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

	Log.unsafe_registerGlobalBottomFloat(formatInstructions);

	return () => {
		unregisterKeyPress();
		Log.unsafe_unregisterGlobalBottomFloat();
	};
}
