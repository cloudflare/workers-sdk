import { stripVTControlCharacters } from "node:util";
import { dim } from "@cloudflare/cli/colors";
import { unwrapHook } from "./api/startDevWorker/utils";
import { logger } from "./logger";
import { onKeyPress } from "./utils/onKeyPress";
import type { Hook } from "./api";

export default function (
	options: Array<{
		keys: string[];
		disabled?: Hook<boolean>;
		label?: Hook<string>;
		handler: () => void | Promise<void>;
	}>,
	render = true
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
			.filter(
				(option) => !unwrapHook(option.disabled) && option.label !== undefined
			)
			.map(({ keys, label }) => `[${keys[0]}] ${dim(unwrapHook(label))}`);

		let stringifiedInstructions = instructions.join(" ");
		const length = stripVTControlCharacters(stringifiedInstructions).length;

		const ADDITIONAL_CHARS = 6; // 3 chars on each side of the instructions for the box and spacing ("│  " and "  │")
		const willWrap = length + ADDITIONAL_CHARS > process.stdout.columns;
		if (willWrap) {
			stringifiedInstructions = instructions.join("\n");
		}

		const maxLineLength = Math.max(
			...stringifiedInstructions
				.split("\n")
				.map((line) => stripVTControlCharacters(line).length)
		);

		stringifiedInstructions = stringifiedInstructions
			.split("\n")
			.map(
				(line) =>
					`│  ${line + " ".repeat(Math.max(0, maxLineLength - stripVTControlCharacters(line).length))}  │`
			)
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

	function printInstructions() {
		const bottomFloat = formatInstructions();
		if (bottomFloat) {
			// eslint-disable-next-line no-console
			console.log(bottomFloat);
		}
	}

	if (render) {
		printInstructions();
	}

	return () => {
		unregisterKeyPress();
	};
}
