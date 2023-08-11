import chalk from "chalk";
import supportsColor from "supports-color";

/**
 * Terminal styling util function that sets text color. If terminal does
 * not support colors, it will return the unchanged text instead.
 */
export function highlight(text: string, colorHex: string): string {
	return supportsColor.stdout ? chalk.hex(colorHex)(text) : text;
}

/**
 * Terminal styling util function that makes text bold.
 */
export function embolden(text: string): string {
	return chalk.bold(text);
}
