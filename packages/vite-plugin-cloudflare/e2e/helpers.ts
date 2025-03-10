import childProcess, { ChildProcess } from "node:child_process";
import events from "node:events";
import fs from "node:fs/promises";
import path from "node:path";
import util from "node:util";
import { stripAnsi } from "miniflare";
import kill from "tree-kill";
import { test as baseTest, inject, onTestFailed, vi } from "vitest";

const debuglog = util.debuglog("vite-plugin:test");

const testEnv = {
	...process.env,
	// The following env vars are set to ensure that package managers
	// do not use the same global cache and accidentally hit race conditions.
	YARN_CACHE_FOLDER: "./.yarn/cache",
	YARN_ENABLE_GLOBAL_CACHE: "false",
	PNPM_HOME: "./.pnpm",
	npm_config_cache: "./.npm/cache",
};

/**
 * Extends the Vitest `test()` function to support running vite in
 * well defined environments that represent real-world usage.
 */
export const test = baseTest.extend<{
	seed: (fixture: string) => Promise<string>;
	viteCommand: (
		pm: "pnpm" | "npm" | "yarn",
		command: "dev" | "preview",
		projectPath: string,
		options?: { flags?: string[]; maxBuffer?: number }
	) => Promise<Process>;
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
		if (!process.env.CLOUDFLARE_VITE_E2E_KEEP_TEMP_DIRS) {
			for (const projectPath of projectPaths) {
				debuglog("Deleting project path", projectPath);
				await fs.rm(projectPath, {
					force: true,
					recursive: true,
					maxRetries: 10,
				});
			}
		}
	},
	/** Starts a command and wraps its outputs. */
	async viteCommand({}, use) {
		const processes: ChildProcess[] = [];
		await use(async (pm, command, projectPath) => {
			if (command === "preview") {
				// We must first run the build command to generate the Worker that is to be previewed.
				await runCommand(`${pm} exec vite build`, projectPath);
			}

			debuglog(`starting "${command}" with ${pm} in ${projectPath}`);
			const proc = childProcess.exec(`${pm} exec vite ${command}`, {
				cwd: projectPath,
				env: testEnv,
			});
			processes.push(proc);
			return wrap(proc);
		});
		debuglog("Closing down command processes", processes.length);
		processes.forEach((proc) => proc.pid && kill(proc.pid));
	},
});

export interface Process {
	readonly stdout: string;
	readonly stderr: string;
	readonly exitCode: Promise<number>;
}

/**
 * Wraps a long running child process to capture its stdio and make it available programmatically.
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
	const wrappedProc = {
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

	onTestFailed(() => {
		console.log(
			`Wrapped process logs (${proc.spawnfile} ${proc.spawnargs.join(" ")}):`
		);
		console.log(wrappedProc.stdout);
		console.error(wrappedProc.stderr);
	});

	return wrappedProc;
}

export function runCommand(command: string, cwd: string) {
	debuglog(`Running "${command}"`);
	childProcess.execSync(command, {
		cwd,
		stdio: debuglog.enabled ? "inherit" : "ignore",
		env: testEnv,
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
		{ interval: 100, timeout: 20_000 }
	);
	return match[1];
}
