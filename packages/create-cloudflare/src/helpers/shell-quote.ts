import shellquote from "shell-quote";

export const quote = shellquote.quote;

export function parse(cmd: string, env?: Record<string, string>): string[] {
	// This is a workaround for a bug in shell-quote on Windows
	// It was fixed and, because it was a breaking change, then reverted
	// in https://github.com/ljharb/shell-quote/commit/144e1c2#diff-e727e4b
	// We can remove this once we upgrade to a version that includes the fix
	// tracked by https://github.com/ljharb/shell-quote/issues/10
	if (process.platform === "win32") {
		cmd = cmd.replaceAll("\\", "\\\\");
	}

	const entries = shellquote.parse(cmd, env);
	const argv: string[] = [];

	for (const entry of entries) {
		// use string entries, as is
		if (typeof entry === "string") {
			argv.push(entry);
			continue;
		}

		// ignore comments
		if ("comment" in entry) {
			continue;
		}

		// we don't want to resolve globs, passthrough the pattern unexpanded
		if (entry.op === "glob") {
			argv.push(entry.pattern);
			continue;
		}

		// any other entry.op is a ControlOperator (e.g. && or ||) we don't want to support
		throw new Error(
			`Only simple commands are supported, please don't use the "${entry.op}" operator in "${cmd}".`
		);
	}

	return argv;
}
