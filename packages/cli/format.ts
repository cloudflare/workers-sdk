/**
 * Format module — one-line prefix-symbol message formatters.
 *
 * Each helper returns a string (it does NOT print). Callers decide
 * where to write — stdout via `logRaw`, stderr via `process.stderr`,
 * or composed into a larger output.
 *
 * The visual vocabulary is "prefix symbol + message":
 *
 *     ✔ Operation succeeded
 *     ✘ Something failed
 *     ⚠ Heads up
 *     ℹ For your information
 *     → Try this next
 *     ▎ Step 1 · Section title
 *
 * For multi-line panels (errors with details, summary blocks), use
 * the `box` module instead.
 */

import chalk from "chalk";
import figures from "figures";
import { brandColor } from "./colors";

/** Format a success message. `◇  <message>` (green hollow diamond,
 *  matching clack-prompts' `log.step` style for visual continuity
 *  with submitted prompts). */
export function success(message: string): string {
	return `${chalk.green("◇")}  ${message}`;
}

/** Format an error message. `✘ <message>` */
export function error(message: string): string {
	return `${chalk.red(figures.cross)} ${message}`;
}

/** Format a warning message. `⚠ <message>` */
export function warning(message: string): string {
	return `${chalk.yellow(figures.warning)} ${message}`;
}

/** Format an info message. `ℹ <message>` */
export function info(message: string): string {
	return `${chalk.cyan(figures.info)} ${message}`;
}

/**
 * Format a hint or tip. `→ <dim message>`
 *
 * Hints are rendered dim and prefixed with an arrow to indicate
 * forward action ("try this next").
 */
export function hint(message: string): string {
	return `${chalk.dim(figures.arrowRight)} ${chalk.dim(message)}`;
}

/**
 * Format a list item. `  • <text>`
 *
 * @param text   The item content
 * @param indent Leading-space count (default: 2)
 */
export function listItem(text: string, indent = 2): string {
	return `${" ".repeat(indent)}${figures.bullet} ${text}`;
}

/**
 * Format a section header. `▎ <bold title>`
 *
 * Section headers replace the gutter-style `╭ ... ╰` corners. They
 * stand alone on a single line, demarcating logical groups in
 * multi-step flows. The left bar is rendered in the brand color.
 *
 * @param title    The section title (rendered bold)
 * @param subtitle Optional dim suffix after a separator
 */
export function sectionHeader(title: string, subtitle?: string): string {
	const bar = brandColor("▎");
	const head = chalk.bold(title);
	if (subtitle) {
		return `${bar} ${head} ${chalk.dim("·")} ${chalk.dim(subtitle)}`;
	}
	return `${bar} ${head}`;
}

/** Format a label/value pair. `<bold label>: <value>` */
export function labelValue(label: string, value: string): string {
	return `${chalk.bold(label)}: ${value}`;
}

/**
 * Format a command for display in copy. `<cyan command>`
 *
 * Used inline in messages like "Run \`wrangler login\` to log in".
 */
export function command(cmd: string): string {
	return chalk.cyan(cmd);
}
