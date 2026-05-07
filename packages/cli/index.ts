import { exit } from "node:process";
import * as clack from "@clack/prompts";
import chalk from "chalk";
import { dim, hidden } from "./colors";
import { stderr, stdout } from "./streams";

// Returns a string containing n non-trimmable spaces
// This is useful for places where clack trims lines of output
// but we need leading spaces
export const space = (n = 1) => {
	return hidden("\u200A".repeat(n));
};

const LOGGER_LEVELS = {
	none: -1,
	error: 0,
	warn: 1,
	info: 2,
	log: 3,
	debug: 4,
} as const;

export type LoggerLevel = keyof typeof LOGGER_LEVELS;

// Global log level that can be set by consuming packages
let currentLogLevel: LoggerLevel = "log";

export function setLogLevel(level: LoggerLevel) {
	currentLogLevel = level;
}

export function getLogLevel(): LoggerLevel {
	return currentLogLevel;
}

// Primitive for printing to stdout. Use this instead of
// console.log or printing to stdout directly
export const logRaw = (msg: string) => {
	// treat all log calls as 'log' level logs
	const currentLevel = getLogLevel();

	// Only output if current log level allows 'log' level messages
	if (LOGGER_LEVELS[currentLevel] >= LOGGER_LEVELS.log) {
		stdout.write(`${msg}\n`);
	}
};

// Plain log line — no prefix symbol, no gutter. Identical to logRaw
// but kept as a separate export for callers that want a multi-line
// message printed verbatim.
export const log = (msg: string) => {
	logRaw(msg);
};

export const newline = () => {
	logRaw("");
};

/**
 * Format a multi-line message with optional per-line prefix decoration.
 *
 * This used to draw the gutter `│` thread for the C3 wizard layout.
 * Reduced to a simple line-prefix utility — most callers can now use
 * the prefix-symbol helpers (`success`, `warn`, `error`,
 * `updateStatus`) directly.
 */
type FormatOptions = {
	linePrefix?: string;
	firstLinePrefix?: string;
	newlineBefore?: boolean;
	newlineAfter?: boolean;
	formatLine?: (line: string) => string;
	multiline?: boolean;
};
export const format = (
	msg: string,
	{
		linePrefix = "",
		firstLinePrefix = linePrefix,
		newlineBefore = false,
		newlineAfter = false,
		formatLine = (line: string) => line,
		multiline = true,
	}: FormatOptions = {}
) => {
	const lines = multiline ? msg.split("\n") : [msg];
	const formattedLines = lines.map(
		(line, i) => (i === 0 ? firstLinePrefix : linePrefix) + formatLine(line)
	);

	if (newlineBefore) {
		formattedLines.unshift("");
	}
	if (newlineAfter) {
		formattedLines.push("");
	}

	return formattedLines.join("\n");
};

// All clack helpers below thread `output: stdout` from `./streams`
// rather than letting clack default to `process.stdout` directly.
// This keeps a single mockable boundary so consumers' tests can
// intercept clack output via existing helpers like
// `mockCLIOutput()` / `collectCLIOutput()` (which spy on
// `cli-shared-helpers/streams`). Without it, `clack.intro()`,
// `clack.outro()`, `clack.log.*`, and `clack.note()` write straight
// to `process.stdout` and bypass any test mock.

/**
 * Status update line — delegates to `clack.log.step` (`◇  message`).
 */
export const updateStatus = (msg: string) => {
	clack.log.step(msg, { output: stdout });
};

/**
 * Start a logical section. Delegates to `clack.intro()` which renders
 * the right-angle `┌  heading` opener, with the (optional) subheading
 * appended dim and middot-separated.
 *
 *     ┌  Create an application with Cloudflare · Step 1 of 3
 *
 * Pairs with `endSection()` (`└`) which closes the same thread.
 */
export const startSection = (heading: string, subheading?: string) => {
	const head = chalk.bold(heading);
	const tail = subheading ? ` ${dim("·")} ${dim(subheading)}` : "";
	clack.intro(`${head}${tail}`, { output: stdout });
};

/**
 * End a logical section. Delegates to `clack.outro()` which renders
 * the right-angle `└  heading` closer.
 */
export const endSection = (heading?: string, subheading?: string) => {
	const head = heading ? chalk.bold(heading) : "";
	const tail = subheading ? ` ${dim("·")} ${dim(subheading)}` : "";
	clack.outro(`${head}${tail}`, { output: stdout });
};

/**
 * User cancelled the operation (ctrl+c, esc, or programmatic cancel).
 * Delegates to `clack.cancel()` which renders the closing `└` corner
 * + red message.
 */
export const cancel = (msg: string) => {
	clack.cancel(msg, { output: stdout });
};

/**
 * Warning. Delegates to `clack.log.warn` (`▲  message`, yellow).
 */
export const warn = (msg: string) => {
	clack.log.warn(msg, { output: stdout });
};

/**
 * Success / step in flow. Delegates to `clack.log.step`
 * (`◇  message`, green hollow diamond — matching the submitted-prompt
 * symbol so success lines visually thread with the surrounding prompt
 * flow).
 */
export const success = (msg: string) => {
	clack.log.step(msg, { output: stdout });
};

/**
 * Multi-line block with optional title — delegates to `clack.note()`
 * (`├──╮ Title  body  ├──╯`). Use for grouped informational content
 * inside a flow.
 *
 * `withGuide` (default `true`) controls whether clack draws the
 * leading `│` spacing line above the box and uses `├` for the
 * bottom-left corner (so the box visually threads with a surrounding
 * `clack.intro()` / prompts gutter). Pass `false` for a standalone
 * box with `╰` corner — useful for the FIRST note in a flow that
 * follows non-clack output (e.g. a `logger.warn(...)` warning) where
 * a leading orphaned `│` would look ugly.
 */
export const note = (
	message: string,
	title?: string,
	opts?: { withGuide?: boolean }
) => {
	clack.note(message, title, {
		output: stdout,
		...(opts?.withGuide !== undefined && { withGuide: opts.withGuide }),
	});
};

// Strip the ansi color characters out of the line when calculating
// line length, otherwise the padding will be thrown off
// Used from https://github.com/natemoo-re/clack/blob/main/packages/prompts/src/index.ts
export const stripAnsi = (str: string) => {
	const pattern = [
		"[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]+)*|[a-zA-Z\\d]+(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)",
		"(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-nq-uy=><~]))",
	].join("|");
	const regex = RegExp(pattern, "g");

	return str.replace(linkRegex, "$2").replace(regex, "");
};

// Regular Expression that matches a hyperlink
// e.g. `\u001B]8;;http://example.com/\u001B\\This is a link\u001B]8;;\u001B\`
export const linkRegex =
	// eslint-disable-next-line no-control-regex -- regex intentionally matches ANSI escape sequences for hyperlink parsing
	/\u001B\]8;;(?<url>.+)\u001B\\(?<label>.+)\u001B\]8;;\u001B\\/g;

// Create a hyperlink in terminal
// It works in iTerm2 and VSCode's terminal, but not macOS built-in terminal app
export const hyperlink = (url: string, label = url) => {
	return `\u001B]8;;${url}\u001B\\${label}\u001B]8;;\u001B\\`;
};

/**
 * Print an error and exit with code 1.
 */
export const crash: (msg?: string, extra?: string) => never = (msg, extra) => {
	error(msg, extra);
	exit(1);
};

/**
 * Error. Delegates to `clack.log.error` (`■  message`, red). The
 * optional `<extra>` line is appended on its own line within the
 * gutter.
 *
 * `msg` is coerced to a string — callers occasionally pass `Error`
 * instances (e.g. C3's top-level `.catch((e) => error(e))`), and
 * `clack.log.error` calls `.split("\n")` on its input which would
 * throw `TypeError: e.split is not a function`.
 */
export const error = (msg?: unknown, extra?: string) => {
	const currentLevel = getLogLevel();
	if (msg !== undefined && LOGGER_LEVELS[currentLevel] >= LOGGER_LEVELS.error) {
		const text = typeof msg === "string" ? msg : String(msg);
		clack.log.error(extra ? `${text}\n${extra}` : text, { output: stderr });
	}
};

export { checkMacOSVersion } from "./check-macos-version";
export { showCursor } from "./cursor";
