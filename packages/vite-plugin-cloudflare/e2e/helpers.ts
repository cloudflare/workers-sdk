import childProcess, { ChildProcess } from "node:child_process";
import events from "node:events";
import fs from "node:fs/promises";
import path from "node:path";
import util from "node:util";
import { stripAnsi } from "miniflare";
import kill from "tree-kill";
import { test as baseTest, inject, vi } from "vitest";

const debuglog = util.debuglog("vite-plugin:test");

/**
 * Extends the Vitest `test()` function to support running vite in
 * well defined environments that represent real-world usage.
 */
export const test = baseTest.extend<{
	seed: (fixture: string) => Promise<string>;
	viteDev: (
		projectPath: string,
		options?: { flags?: string[]; maxBuffer?: number }
	) => Process;
}>({
	/** Seed a test project from a fixture. */
	async seed({}, use) {
		const root = inject("root");
		const projectPaths: string[] = [];
		await use(async (fixture) => {
			const projectPath = path.resolve(root, fixture);
			await fs.cp(path.resolve(__dirname, "fixtures", fixture), projectPath, {
				recursive: true,
				errorOnExist: true,
			});
			debuglog("Fixture copied to " + projectPath);
			projectPaths.push(projectPath);
			return projectPath;
		});
		for (const projectPath of projectPaths) {
			debuglog("Deleting project path", projectPath);
			await fs.rm(projectPath, {
				force: true,
				recursive: true,
				maxRetries: 10,
			});
		}
	},
	/** Start a `vite dev` command and wraps its outputs. */
	async viteDev({}, use) {
		const processes: ChildProcess[] = [];
		await use((projectPath) => {
			debuglog("starting vite for " + projectPath);
			const proc = childProcess.exec(`pnpm exec vite dev`, {
				cwd: projectPath,
			});
			processes.push(proc);
			return wrap(proc);
		});
		debuglog("Closing down vite dev processes", processes.length);
		processes.forEach((proc) => proc.pid && kill(proc.pid));
	},
});

export interface Process {
	readonly stdout: string;
	readonly stderr: string;
	readonly exitCode: Promise<number>;
}

/**
 * Wrap a long running child process to capture its stdio and make it available programmatically.
 */
function wrap(proc: childProcess.ChildProcess): Process {
	let stdout = "";
	let stderr = "";
	proc.stdout?.setEncoding("utf8");
	proc.stderr?.setEncoding("utf8");
	proc.stdout?.on("data", (chunk) => {
		if (debuglog.enabled) {
			process.stdout.write(chunk);
		}
		stdout += chunk;
	});
	proc.stderr?.on("data", (chunk) => {
		if (debuglog.enabled) {
			process.stderr.write(chunk);
		}
		stderr += chunk;
	});
	const closePromise = events.once(proc, "close");
	return {
		get stdout() {
			return stripAnsi(stdout);
		},
		get stderr() {
			return stripAnsi(stderr);
		},
		get exitCode() {
			return closePromise.then(([exitCode]) => exitCode ?? -1);
		},
	};
}

export function runCommand(command: string, cwd: string) {
	childProcess.execSync(command, {
		cwd,
		stdio: debuglog.enabled ? "inherit" : "ignore",
	});
}

export async function fetchJson(url: string, info?: RequestInit) {
	return vi.waitFor(
		async () => {
			const response = await fetch(url, {
				headers: { "MF-Disable-Pretty-Error": "true" },
				...info,
			});
			const text = await response.text();
			try {
				return JSON.parse(text) as unknown;
			} catch (cause) {
				const err = new Error(`Failed to parse JSON from:\n${text}`);
				err.cause = cause;
				throw err;
			}
		},
		{ timeout: 10_000, interval: 250 }
	);
}

/** Wait until a `vite dev` process is ready and capture the url on which it is listening. */
export async function waitForReady(proc: Process) {
	const match = await vi.waitUntil(
		() => proc.stdout.match(/Local:\s+(http:\/\/localhost:\d+)/),
		{ interval: 100, timeout: 5_000 }
	);
	return match[1];
}
