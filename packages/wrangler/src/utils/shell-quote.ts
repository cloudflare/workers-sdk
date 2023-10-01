import shellquote from "shell-quote";

export const quote = shellquote.quote;

export function parse(cmd: string, env?: Record<string, string>): string[] {
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
