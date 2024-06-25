import readline from "readline";

type KeypressEvent = {
	name: string;
	ctrl: boolean;
};

export function hotkeys(
	callback: (key: string) => void,
	stdin = process.stdin
) {
	if (stdin.isTTY) {
		readline.emitKeypressEvents(stdin);
		stdin.setRawMode(true);
	}

	const onKeyPress = (char: string, key: KeypressEvent) => {
		if (key && key.ctrl && key.name == "c") {
			char = "CTRL+C";
		}

		if (char) {
			callback(char);
		}
	};

	stdin.on("keypress", onKeyPress);

	return () => stdin.off("keypress", onKeyPress);
}
