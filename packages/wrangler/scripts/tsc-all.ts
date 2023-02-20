// Runs `tsc` against all `tsconfig.json`s in the current working directory.
// This ensures all files are type-checked with the correct configuration.

import childProcess from "node:child_process";
import events from "node:events";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import chalk from "chalk";

const colours = [
	chalk.red,
	chalk.yellow,
	chalk.green,
	chalk.cyan,
	chalk.blue,
	chalk.magenta,
];

const argv = process.argv.slice(2);

function* walkTsConfigs(root: string): Generator<string> {
	const entries = fs.readdirSync(root, { withFileTypes: true });
	for (const entry of entries) {
		if (entry.name === "node_modules") continue; // Ignore `node_modules`s
		const entryPath = path.join(root, entry.name);
		if (entry.isDirectory()) {
			yield* walkTsConfigs(entryPath);
		} else if (entry.name === "tsconfig.json") {
			yield entryPath;
		}
	}
}

// Find all `tsconfig.json`'s in the current directory
const tsConfigs = Array.from(walkTsConfigs(process.cwd())).sort();

const prefixes = tsConfigs.map((tsConfig) =>
	path.dirname(path.relative("", tsConfig))
);
const maxPrefixLength = Math.max(...prefixes.map((prefix) => prefix.length));

type ExitEventArguments = [code: number | null, signal: NodeJS.Signals | null];
function runTsc(i: number, watch = false): Promise<ExitEventArguments> {
	const tsConfig = tsConfigs[i];
	const colour = colours[i % colours.length];
	const prefix = colour.bold(
		`[ ${prefixes[i].padEnd(maxPrefixLength, " ")} ] `
	);

	const command = "tsc";
	// Enable detailed pretty diagnostics (enabled by default when using a TTY,
	// but not when piping stdio)
	const args = ["--project", tsConfig, "--pretty"];
	if (watch) {
		// Enable watch mode without clearing the console each time
		args.push("--watch", "--preserveWatchOutput");
	}
	const result = childProcess.spawn(command, args, {
		shell: true,
		stdio: "pipe",
	});
	const stdout = readline.createInterface({ input: result.stdout });
	const stderr = readline.createInterface({ input: result.stderr });
	stdout.on("line", (line) => console.log(prefix + line));
	stderr.on("line", (line) => console.error(prefix + line));
	return events.once(result, "exit") as Promise<ExitEventArguments>;
}

if (argv.includes("--watch")) {
	// In `--watch` mode, run all `tsc`s in parallel, prefixing output with the
	// relative path containing the `tsconfig.json`
	for (let i = 0; i < tsConfigs.length; i++) {
		void runTsc(i, true);
	}
} else {
	// Otherwise, run all `tsc`'s in serial, to avoid interleaving outputs
	void (async () => {
		for (let i = 0; i < tsConfigs.length; i++) {
			const [code] = await runTsc(i);
			// If type checking failed (exit with non-zero code), and we haven't set an
			// exit code yet, use this one to fail this script
			if (code !== null && code !== 0 && process.exitCode === undefined) {
				process.exitCode = code;
			}
		}
	})();
}
