import { exit } from "process";
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

// Primitive for printing to stdout. Use this instead of
// console.log or printing to stdout directly
export const logRaw = (msg: string) => {
	stdout.write(`${msg}\n`);
};

// A simple stylized log for use within a prompt
export const log = (msg: string) => {
	const lines = msg.split("\n").map((ln) => `${gray(shapes.bar)} ${white(ln)}`);

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

	return str.replace(regex, "");
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
	if (msg) {
		stderr.write(
			`${gray(corner)} ${status.error} ${dim(msg)}\n${
				extra ? space() + extra + "\n" : ""
			}`
		);
	}
};
