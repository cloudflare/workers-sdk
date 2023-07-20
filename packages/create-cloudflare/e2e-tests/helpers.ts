import { spawn } from "cross-spawn";

export const keys = {
	enter: "\x0d",
	backspace: "\x7f",
	escape: "\x1b",
	up: "\x1b\x5b\x41",
	down: "\x1b\x5b\x42",
	right: "\x1b\x5b\x43",
	left: "\x1b\x5b\x44",
};

export type PromptHandler = {
	matcher: RegExp;
	input: string[];
};

export type RunnerConfig = {
	promptHandlers?: PromptHandler[];
	argv?: string[];
};

export const runC3 = async ({
	argv = [],
	promptHandlers = [],
}: RunnerConfig) => {
	const proc = spawn("node", ["./dist/cli.js", ...argv]);
	const stdout: string[] = [];
	const stderr: string[] = [];

	await new Promise((resolve, rejects) => {
		proc.stdout.on("data", (data) => {
			const lines: string[] = data.toString().split("\n");
			const currentDialog = promptHandlers[0];

			lines.forEach((line) => {
				stdout.push(line);

				if (currentDialog && currentDialog.matcher.test(line)) {
					currentDialog.input.forEach((keystroke) => {
						proc.stdin.write(keystroke);
					});

					// Consume the handler once we've used it
					promptHandlers.shift();

					// If we've consumed the last prompt handler, close the input stream
					// Otherwise, the process wont exit properly
					if (promptHandlers[0] === undefined) {
						proc.stdin.end();
					}
				}
			});
		});

		proc.stderr.on("data", (data) => {
			stderr.push(data);
		});

		proc.on("close", (code) => {
			if (code === 0) {
				resolve(null);
			} else {
				rejects(code);
			}
		});

		proc.on("error", (err) => {
			rejects(err);
		});
	});

	return {
		output: stdout.join("\n").trim(),
		errors: stderr.join("\n").trim(),
	};
};
