import process from "node:process";

export function showCursor(show: boolean, stream = process.stderr) {
	if (!stream.isTTY) {
		return;
	}

	if (show) {
		stream.write("\x1b[?25h");
	} else {
		stream.write("\x1b[?25l");
	}
}
