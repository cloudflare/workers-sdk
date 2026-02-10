import { exit } from "node:process";
import {
	bgBlue,
	bgGreen,
	bgRed,
	bgYellow,
	brandColor,
	dim,
	gray,
	hidden,
	white,
} from "./colors";
import { stderr, stdout } from "./streams";

export const shapes = {
	diamond: "◇",
	dash: "─",
	radioInactive: "○",
	radioActive: "●",

	backActive: "◀",
	backInactive: "◁",

	bar: "│",
	leftT: "├",
	rigthT: "┤",

	arrows: {
		left: "‹",
		right: "›",
	},

	corners: {
		tl: "╭",
		bl: "╰",
		tr: "╮",
		br: "╯",
	},
};

export const status = {
	error: bgRed(` ERROR `),
	warning: bgYellow(` WARNING `),
	info: bgBlue(` INFO `),
	success: bgGreen(` SUCCESS `),
	cancel: white.bgRed(` X `),
};

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

// A simple stylized log for use within a prompt
export const log = (msg: string) => {
	const lines = msg
		.split("\n")
		.map((ln) => `${gray(shapes.bar)}${ln.length > 0 ? " " + white(ln) : ""}`);

	logRaw(lines.join("\n"));
};

export const newline = () => {
	log("");
};

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
		linePrefix = gray(shapes.bar),
		firstLinePrefix = linePrefix,
		newlineBefore = false,
		newlineAfter = false,
		formatLine = (line: string) => white(line),
		multiline = true,
	}: FormatOptions = {}
) => {
	const lines = multiline ? msg.split("\n") : [msg];
	const formattedLines = lines.map(
		(line, i) =>
			(i === 0 ? firstLinePrefix : linePrefix) + space() + formatLine(line)
	);

	if (newlineBefore) {
		formattedLines.unshift(linePrefix);
	}
	if (newlineAfter) {
		formattedLines.push(linePrefix);
	}

	return formattedLines.join("\n");
};

// Log a simple status update with a style similar to the clack spinner
export const updateStatus = (msg: string, printNewLine = true) => {
	logRaw(
		format(msg, {
			firstLinePrefix: gray(shapes.leftT),
			linePrefix: gray(shapes.bar),
			newlineAfter: printNewLine,
		})
	);
};

export const startSection = (
	heading: string,
	subheading?: string,
	printNewLine = true
) => {
	logRaw(
		`${gray(shapes.corners.tl)} ${brandColor(heading)} ${
			subheading ? dim(subheading) : ""
		}`
	);
	if (printNewLine) {
		newline();
	}
};

export const endSection = (heading: string, subheading?: string) => {
	logRaw(
		`${gray(shapes.corners.bl)} ${brandColor(heading)} ${
			subheading ? dim(subheading) : ""
		}\n`
	);
};

export const cancel = (
	msg: string,
	{
		// current default is backcompat and makes sense going forward too
		shape = shapes.corners.bl,
		// current default for backcompat -- TODO: change default to true once all callees have been updated
		multiline = false,
	} = {}
) => {
	logRaw(
		format(msg, {
			firstLinePrefix: `${gray(shape)} ${status.cancel}`,
			linePrefix: gray(shapes.bar),
			newlineBefore: true,
			formatLine: (line) => dim(line), // for backcompat but it's not ideal for this to be "dim"
			multiline,
		})
	);
};

export const warn = (
	msg: string,
	{
		// current default for backcompat -- TODO: change default to shapes.bar once all callees have been updated
		shape = shapes.corners.bl,
		// current default for backcompat -- TODO: change default to true once all callees have been updated
		multiline = false,
		newlineBefore = true,
	} = {}
) => {
	logRaw(
		format(msg, {
			firstLinePrefix: gray(shape) + space() + status.warning,
			linePrefix: gray(shapes.bar),
			formatLine: (line) => dim(line), // for backcompat but it's not ideal for this to be "dim"
			multiline,
			newlineBefore,
		})
	);
};

export const success = (
	msg: string,
	{
		// current default for backcompat -- TODO: change default to shapes.bar once all callees have been updated
		shape = shapes.corners.bl,
		// current default for backcompat -- TODO: change default to true once all callees have been updated
		multiline = false,
	} = {}
) => {
	logRaw(
		format(msg, {
			firstLinePrefix: gray(shape) + space() + status.success,
			linePrefix: gray(shapes.bar),
			newlineBefore: true,
			formatLine: (line) => dim(line), // for backcompat but it's not ideal for this to be "dim"
			multiline,
		})
	);
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
	// eslint-disable-next-line no-control-regex
	/\u001B\]8;;(?<url>.+)\u001B\\(?<label>.+)\u001B\]8;;\u001B\\/g;

// Create a hyperlink in terminal
// It works in iTerm2 and VSCode's terminal, but not macOS built-in terminal app
export const hyperlink = (url: string, label = url) => {
	return `\u001B]8;;${url}\u001B\\${label}\u001B]8;;\u001B\\`;
};

export const crash: (msg?: string, extra?: string) => never = (msg, extra) => {
	error(msg, extra);
	exit(1);
};

export const error = (
	msg?: string,
	extra?: string,
	corner = shapes.corners.bl
) => {
	// Only output if current log level allows 'error' level messages
	const currentLevel = getLogLevel();
	if (msg && LOGGER_LEVELS[currentLevel] >= LOGGER_LEVELS.error) {
		stderr.write(
			`${gray(corner)} ${status.error} ${dim(msg)}\n${
				extra ? space() + extra + "\n" : ""
			}`
		);
	}
};

export { checkMacOSVersion } from "./check-macos-version";
export { showCursor } from "./cursor";
