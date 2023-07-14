import { exit } from "process";
import open from "open";
import { brandColor, dim, gray, white, red, hidden, bgRed } from "./colors";

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
	warning: bgRed(` WARNING `),
	info: bgRed(` INFO `),
	success: bgRed(` SUCCESS `),
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
	process.stdout.write(`${msg}\n`);
};

// A simple stylized log for use within a prompt
export const log = (msg: string) => {
	const lines = msg.split("\n").map((ln) => `${gray(shapes.bar)} ${white(ln)}`);

	logRaw(lines.join("\n"));
};

export const newline = () => {
	log("");
};

// Log a simple status update with a style similar to the clack spinner
export const updateStatus = (msg: string) => {
	logRaw(`${gray(shapes.leftT)} ${msg}`);
	newline();
};

export const startSection = (heading: string, subheading?: string) => {
	logRaw(
		`${gray(shapes.corners.tl)} ${brandColor(heading)} ${
			subheading ? dim(subheading) : ""
		}`
	);
	newline();
};

export const endSection = (heading: string, subheading?: string) => {
	logRaw(
		`${gray(shapes.corners.bl)} ${brandColor(heading)} ${
			subheading ? dim(subheading) : ""
		}\n`
	);
};

export const cancel = (msg: string) => {
	newline();
	logRaw(`${gray(shapes.corners.bl)} ${white.bgRed(` X `)} ${dim(msg)}`);
};

export const warn = (msg: string) => {
	newline();
	logRaw(`${gray(shapes.corners.bl)} ${status.warning} ${dim(msg)}`);
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

export const crash = (msg?: string): never => {
	if (msg) {
		process.stderr.write(red(msg));
		process.stderr.write("\n");
	}
	exit(1);
};

/**
 * An extremely simple wrapper around the open command.
 * Specifically, it adds an 'error' event handler so that when this function
 * is called in environments where we can't open the browser (e.g. GitHub Codespaces,
 * StackBlitz, remote servers), it doesn't just crash the process.
 *
 * @param url the URL to point the browser at
 */
export async function openInBrowser(url: string): Promise<void> {
	updateStatus("Opening browser");
	const childProcess = await open(url);
	childProcess.on("error", () => {
		warn("Failed to open browser");
	});
}
