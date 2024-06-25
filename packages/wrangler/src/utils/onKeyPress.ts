import readline from "readline";

type KeypressEvent = { name: string; ctrl: boolean };

export function onKeyPress(
	callback: (key: string) => void,
	stdin = process.stdin
) {
	if (stdin.isTTY) {
		readline.emitKeypressEvents(stdin);
		stdin.setRawMode(true);
	}

	const handler = async (char: string, key: KeypressEvent) => {
		if (key && key.ctrl && key.name == "c") {
			char = "CTRL+C";
		}

		if (char) {
			callback(char);
		}
	};

	stdin.on("keypress", handler);

	return () => stdin.off("keypress", handler);
}
