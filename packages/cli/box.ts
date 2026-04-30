/**
 * Box module — boxen wrappers for prominent multi-line messages.
 *
 * Use a box for output that needs to grab attention: API errors with
 * stack traces, deployment summaries, important warnings. For
 * single-line status lines, use the `format` module's prefix-symbol
 * helpers instead.
 *
 *     ╭─ Error ───────────────────────────╮
 *     │                                   │
 *     │  Authentication failed            │
 *     │  Run wrangler login               │
 *     │                                   │
 *     ╰───────────────────────────────────╯
 */

import boxen, { type Options as BoxenOptions } from "boxen";
import chalk from "chalk";
import { brandColorHex } from "./colors";

/** Box style presets. */
type BoxStyle = "error" | "warning" | "success" | "info" | "brand";

/** Per-style boxen configuration. Borders use rounded corners
 *  consistently; padding is 1 char (left/right) by default.
 */
const boxStyles: Record<BoxStyle, Partial<BoxenOptions>> = {
	error: {
		borderColor: "red",
		borderStyle: "round",
		padding: 1,
		title: "Error",
		titleAlignment: "left",
	},
	warning: {
		borderColor: "yellow",
		borderStyle: "round",
		padding: 1,
		title: "Warning",
		titleAlignment: "left",
	},
	success: {
		borderColor: "green",
		borderStyle: "round",
		padding: 1,
		title: "Success",
		titleAlignment: "left",
	},
	info: {
		borderColor: "cyan",
		borderStyle: "round",
		padding: 1,
		title: "Info",
		titleAlignment: "left",
	},
	brand: {
		// Cloudflare Tangerine — sourced from colors.ts so this package
		// has a single source of truth for the brand orange.
		borderColor: brandColorHex,
		borderStyle: "round",
		padding: 1,
	},
};

/**
 * Render `text` inside a styled box.
 *
 * Falls back to a horizontal-rule layout (no side borders) when the
 * terminal doesn't support color — boxen's box-drawing chars become
 * noisy without color separation.
 *
 * @param text     Box content (multi-line OK)
 * @param style    One of the box style presets
 * @param options  Boxen overrides — `title` is the most common
 */
export function createBox(
	text: string,
	style: BoxStyle,
	options?: Partial<BoxenOptions>
): string {
	if (chalk.level === 0) {
		const title = options?.title ?? boxStyles[style].title;
		const titleLine = title ? `--- ${title} ---\n` : "";
		return `${titleLine}${text}\n${"─".repeat(40)}`;
	}

	return boxen(text, {
		...boxStyles[style],
		...options,
	});
}

/**
 * Word-wrap a plain (un-colored) string to `width` columns.
 * Preserves explicit newlines.
 *
 * Used for pre-wrapping the inside of an error box before applying
 * line-by-line coloring — boxen's built-in wrap breaks ANSI spans
 * so colors get lost on wrapped continuations.
 */
export function wrapPlain(text: string, width: number): string[] {
	const out: string[] = [];
	for (const para of text.split("\n")) {
		if (para.length <= width) {
			out.push(para);
			continue;
		}
		const words = para.split(/\s+/);
		let line = "";
		for (const word of words) {
			if (!line) {
				line = word;
				continue;
			}
			if (line.length + 1 + word.length <= width) {
				line += " " + word;
			} else {
				out.push(line);
				line = word;
			}
		}
		if (line) {
			out.push(line);
		}
	}
	return out;
}

/**
 * Render an error box with a bold-red headline message and optional
 * dimmed details body.
 *
 * @param message   The headline (rendered red+bold per line)
 * @param details   Optional sub-body (rendered dim per line)
 * @param opts.title       Override the default "Error" title
 * @param opts.rawMessage  Skip per-line red coloring; pass the
 *                         caller's already-styled `message` through
 *                         verbatim. Useful when callers want fine-grained
 *                         emphasis (bold codes, subordinate subtitles).
 */
export function errorBox(
	message: string,
	details?: string,
	opts?: { title?: string; rawMessage?: boolean }
): string {
	// Pre-wrap to the box's inner width and color line-by-line. boxen
	// would otherwise wrap mid-ANSI-span and lose color on wrap.
	const innerWidth = Math.max(20, (process.stdout.columns || 80) - 8);
	const colorLines = (s: string, fmt: (t: string) => string) =>
		wrapPlain(s, innerWidth).map(fmt).join("\n");

	let content = opts?.rawMessage
		? message
		: colorLines(message, (t) => chalk.red.bold(t));

	if (details) {
		content += "\n\n" + colorLines(details, (t) => chalk.dim(t));
	}

	return createBox(
		content,
		"error",
		opts?.title ? { title: opts.title } : undefined
	);
}

/** Render a warning box. */
export function warningBox(message: string, details?: string): string {
	let content = chalk.yellow(message);
	if (details) {
		content += "\n\n" + chalk.dim(details);
	}
	return createBox(content, "warning");
}

/** Render a success box. */
export function successBox(message: string, details?: string): string {
	let content = chalk.green(message);
	if (details) {
		content += "\n\n" + chalk.dim(details);
	}
	return createBox(content, "success");
}

/** Render an info box. */
export function infoBox(message: string, details?: string): string {
	let content = chalk.cyan(message);
	if (details) {
		content += "\n\n" + chalk.dim(details);
	}
	return createBox(content, "info");
}

/**
 * Render a branded box (Cloudflare Tangerine border, no semantic
 * connotation). Use for welcome panels and summary blocks where you
 * want presence without "this is an error/warning/etc."
 */
export function brandBox(content: string, title?: string): string {
	return createBox(content, "brand", title ? { title } : undefined);
}
