import assert from "node:assert";
import childProcess from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { TransformStream } from "node:stream/web";
import * as pty from "node-pty"; // node-pty doesn't provide a default export
import type { ReadableStream } from "node:stream/web";

export const isWin = os.platform() === "win32";

// File containing current E2E test temporary directory, shared between all
// running E2E tests
export const E2E_TMP_PATH = path.join(__dirname, ".e2e_tmp_dir");
// Gets the current E2E test temporary directory
export function getRootTmp() {
	return fs.readFileSync(E2E_TMP_PATH, "utf8");
}
// Gets a new temporary directory, inside the current E2E test temporary
// directory for a single test
export function getTmp(): string {
	return fs.mkdtempSync(path.join(getRootTmp(), `tmp-${Date.now()}-`));
}

// Tagged template literal for removing indentation from a block of text.
// If the first line is empty, it will be ignored.
export function dedent(strings: TemplateStringsArray, ...values: unknown[]) {
	// Convert template literal arguments back to a regular string
	const raw = String.raw({ raw: strings }, ...values);
	// Split the string by lines
	let lines = raw.split("\n");
	assert(lines.length > 0);

	// If the last line is just whitespace, remove it
	if (lines[lines.length - 1].trim() === "") {
		lines = lines.slice(0, lines.length - 1);
	}

	// Find the minimum-length indent, excluding the first line
	let minIndent = "";
	// (Could use `minIndent.length` for this, but then would need to start with
	// infinitely long string)
	let minIndentLength = Infinity;
	for (const line of lines.slice(1)) {
		const indent = line.match(/^[ \t]*/)?.[0];
		if (indent != null && indent.length < minIndentLength) {
			minIndent = indent;
			minIndentLength = indent.length;
		}
	}

	// If the first line is just whitespace, remove it
	if (lines.length > 0 && lines[0].trim() === "") lines = lines.slice(1);

	// Remove indent from all lines, and return them all joined together
	lines = lines.map((line) =>
		line.startsWith(minIndent) ? line.substring(minIndent.length) : line
	);
	return lines.join("\n");
}

// Seeds the `root` directory on the file system with some data. Use in
// combination with `dedent` for petty formatting of seeded contents.
export async function seed(root: string, files: Record<string, string>) {
	// TODO(someday): allow copying/symlinking file/directory paths in seed? like "path`${__dirname}/../fixture`"?
	for (const [name, contents] of Object.entries(files)) {
		const filePath = path.resolve(root, name);
		await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
		await fs.promises.writeFile(filePath, contents);
	}
}

// Splits incoming stream into non-empty, trimmed lines
export class LineSplittingStream extends TransformStream<string, string> {
	constructor() {
		let buffer = "";
		super({
			transform(chunk, controller) {
				buffer += chunk;
				// Keep looking for lines in `buffer` until we can't find anymore
				// eslint-disable-next-line no-constant-condition
				while (true) {
					// Try to find the next line break (either LF or CRLF)
					const nextLineIndex = buffer.indexOf("\n");
					// If no line break found in current `buffer`, stop looking and wait
					// for more chunks
					if (nextLineIndex === -1) break;
					// Remove line from `buffer`, and enqueue if non-empty.
					// `trim()` handles case of CRLF, by removing CR.
					const line = buffer.substring(0, nextLineIndex).trim();
					if (line !== "") controller.enqueue(line);
					// `trimStart()` ensures we don't find the current line again
					buffer = buffer.substring(nextLineIndex).trimStart();
				}
			},
			flush(controller) {
				// If we have stuff left in the buffer, and no more chunks are coming,
				// enqueue as a line if non-empty
				buffer = buffer.trim();
				if (buffer !== "") controller.enqueue(buffer);
			},
		});
	}
}

export interface E2EProcess {
	// Process wrapped in pseudo-TTY, can be used to write input as a user would
	// (e.g. pressing hotkeys)
	process: pty.IPty;
	// Output from `process`, stdout and stderr are merged when using a pseudo-TTY
	lines: ReadableStream<string>;
	// Promise that resolves with the exit code of `process` on termination
	exitPromise: Promise<number>;
	// Exit code of `process` or `undefined` if it hasn't terminated yet
	exitCode?: number;
	// Sends a signal to the spawned process, resolving with the exit code.
	// `signal` defaults to `SIGINT` (CTRL-C), unlike `ChildProcess#kill()` which
	// defaults to `SIGTERM`. NOTE: `signal` is ignored on Windows.
	kill(signal?: NodeJS.Signals): Promise<number>;
}
// Module level variable for processes started by the test that imported this
// file, cleaned-up in `cleanupSpawnedProcesses`
const spawnedProcesses = new Set<E2EProcess>();
// Spawn a command with the installed E2E `node_module`'s binaries in the `PATH`
export async function spawn(
	cwd: string,
	command: string[]
): Promise<E2EProcess> {
	// Build `env` with temporary directory's `.bin` in PATH
	const bin = path.join(getRootTmp(), "node_modules", ".bin");
	const pathSeparator = process.platform === "win32" ? ";" : ":";
	const PATH = `${bin}${pathSeparator}${process.env.PATH}`;
	const env = {
		...process.env,
		PATH,
		FORCE_COLOR: "0",
	};

	// Spawn the command in the correct working directory and with the correct
	// environment variables
	// https://nodejs.org/api/child_process.html#child_processspawncommand-args-options
	const shell = isWin ? "cmd.exe" : "/bin/sh";
	// https://nodejs.org/api/child_process.html#shell-requirements
	const shellArgs = isWin ? ["/d", "/s", "/c"] : ["-c"];
	const commandStr = command.join(" ");
	process.stdout.write(`\n---> Running "${commandStr}"...\n`);
	const child = pty.spawn(shell, [...shellArgs, commandStr], {
		name: "xterm-color",
		cols: 100,
		rows: 30,
		cwd,
		env,
	});

	// Construct line-by-line stream for reading output. All output is written to
	// the terminal for debugging too.
	const { readable, writable } = new LineSplittingStream();
	const writer = writable.getWriter();
	const onDataSubscription = child.onData((chunk) => {
		process.stdout.write(chunk);
		void writer.write(chunk);
	});

	// Construct a promise that resolves with the exit code, also close the duplex
	// stream when the process terminates
	const exitPromise = new Promise<number>((resolve) => {
		child.onExit(({ exitCode }) => {
			onDataSubscription.dispose();
			void writer.close();
			result.exitCode = exitCode;
			resolve(exitCode);
		});
	});

	const result: E2EProcess = {
		process: child,
		lines: readable,
		exitPromise,
		kill(signal: NodeJS.Signals = "SIGINT") {
			// `child.kill()` throws when a signal is passed on Windows
			child.kill(isWin ? undefined : signal);
			return exitPromise;
		},
	};
	spawnedProcesses.add(result);
	return result;
}
// Make sure all processes started by this test are killed
export function cleanupSpawnedProcesses() {
	for (const proc of spawnedProcesses) {
		// If this process hasn't already exited, kill it.
		// (`void`ing `Promise` as we don't care about the exit code, nor the fact
		// that the process actually exits here, this is just best-effort cleanup)
		if (proc.exitCode === undefined) void proc.kill("SIGKILL");
	}
	spawnedProcesses.clear();
}

type RegExpMatchGroupsArray<Groups> = Omit<RegExpMatchArray, "groups"> & {
	groups: Groups;
};
// Keeps reading lines until the passed regular expression matches. If no lines
// match and the interface is closed, throws an error.
export async function readUntil<
	Groups extends Record<string, string> = Record<string, string>
>(
	lines: ReadableStream<string>,
	regExp: RegExp
): Promise<RegExpMatchGroupsArray<Groups>> {
	const iterator = lines[Symbol.asyncIterator]({ preventCancel: true });
	for await (const line of iterator) {
		const match = line.match(regExp);
		if (match !== null) {
			return match as unknown as RegExpMatchGroupsArray<Groups>;
		}
	}
	throw new Error(`Exhausted lines trying to match ${regExp}`);
}

// Global setup function, called by Jest once before running E2E tests
export default function (): void {
	// Installs a copy of `wrangler` (as a user would) to a temporary directory.

	// 1. Generate a temporary directory to install to
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wrangler-e2e-"));
	fs.mkdirSync(tmp, { recursive: true });
	fs.writeFileSync(E2E_TMP_PATH, tmp);

	// 2. Package up our current version of `wrangler` into a tarball
	console.log("\n---> Packaging wrangler...");
	const root = path.resolve(__dirname, "..");
	const packResult = childProcess.spawnSync(
		"npm",
		["pack", "--workspace", "packages/wrangler", "--pack-destination", tmp],
		{ shell: true, cwd: root }
	);
	assert.strictEqual(packResult.status, 0, packResult.stderr.toString());
	const packName = packResult.stdout.toString().trim();

	// 3. Install that tarball into the temporary directory
	console.log(`---> Installing wrangler in ${tmp}...`);
	const installResult = childProcess.spawnSync(
		"npm",
		["install", `wrangler@${packName}`],
		{ shell: true, cwd: tmp, stdio: "inherit" }
	);
	assert.strictEqual(installResult.status, 0);
}
