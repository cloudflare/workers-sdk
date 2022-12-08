import assert from "node:assert";
import childProcess from "node:child_process";
import events from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import stream from "node:stream";
import * as pty from "node-pty"; // node-pty doesn't provide a default export

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

export interface E2EProcess {
	// Process wrapped in pseudo-TTY, can be used to write input as a user would
	// (e.g. pressing hotkeys)
	process: pty.IPty;
	// Output from `process`, stdout and stderr are merged when using a pseudo-TTY
	stdio: readline.Interface;
	// Promise that resolves with the exit code of `process` on termination
	exitPromise: Promise<number>;
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
		FORCE_COLOR: "0", // Colour codes make it tricky to match on console output
	};

	// Spawn the command in the correct working directory and with the correct
	// environment variables
	const isWin = os.platform() === "win32";
	// https://nodejs.org/api/child_process.html#child_processspawncommand-args-options
	const shell = isWin ? "cmd.exe" : "/bin/sh";
	// https://nodejs.org/api/child_process.html#shell-requirements
	const shellArgs = isWin ? ["/d", "/s", "/c"] : ["-c"];
	const child = pty.spawn(shell, [...shellArgs, command.join(" ")], {
		name: "xterm-color",
		cols: 100,
		rows: 30,
		cwd,
		env,
	});

	// Wrap stdout with readline for easy line-by-line processing, and write all
	// output to the terminal for debugging. Unfortunately, `child` isn't a
	// `NodeJS.ReadableStream`, so we have to create an intermediate, identity
	// duplex stream to use readline.
	const duplex = new stream.PassThrough();
	child.on("data", (chunk) => {
		process.stdout.write(chunk);
		duplex.write(chunk);
	});
	const stdio = readline.createInterface({ input: duplex });

	// Construct a promise that resolves with the exit code, also close the duplex
	// stream when the process terminates
	const exitPromise = new Promise<number>((resolve) => {
		child.on("exit", (code) => {
			duplex.end();
			resolve(code);
		});
	});

	const result: E2EProcess = {
		process: child,
		stdio,
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
	for (const proc of spawnedProcesses) proc.process.kill("SIGKILL");
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
	rl: readline.Interface,
	regExp: RegExp
): Promise<RegExpMatchGroupsArray<Groups>> {
	const controller = new AbortController();
	const closePromise = events.once(rl, "close", { signal: controller.signal });
	// eslint-disable-next-line no-constant-condition
	while (true) {
		// Workaround for https://github.com/nodejs/node/pull/43373 (fixed in
		// Node >16.17.0 and >18.4.0). Record the "abort" event listener added to
		// the `signal`, and remove it after the `once` `Promise` resolves to avoid
		// event listener memory leaks.
		let abortListener;
		const signalProxy = new Proxy(controller.signal, {
			get(target, propertyKey, receiver) {
				const original = Reflect.get(target, propertyKey, receiver);
				if (propertyKey === "addEventListener") {
					assert(typeof original === "function");
					return (type: string, listener: unknown, options: unknown) => {
						abortListener = listener;
						original.call(target, type, listener, options);
					};
				}
				return original;
			},
		});

		const linePromise = events.once(rl, "line", { signal: signalProxy });
		const [line] = await Promise.race([closePromise, linePromise]);
		// @ts-expect-error our version of `@types/node` is missing proper
		//  `AbortSignal` types
		controller.signal.removeEventListener("abort", abortListener);

		// `line` will be undefined if `close` was emitted first
		if (typeof line === "string") {
			const match = line.match(regExp);
			if (match !== null) {
				controller.abort(); // Remove hanging `once` event listener
				return match as RegExpMatchGroupsArray<Groups>;
			}
		} else {
			controller.abort(); // Remove hanging `once` event listener
			throw new Error(`Exhausted lines trying to match ${regExp}`);
		}
	}
}

export default function (): void {
	// Installs a copy of `wrangler` (as a user would) to a temporary directory.

	// 1. Generate a temporary directory to install to
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wrangler-e2e-"));
	fs.writeFileSync(E2E_TMP_PATH, tmp);

	// 2. Package up our current version of `wrangler` into a tarball
	console.log("---> Packaging wrangler...");
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
