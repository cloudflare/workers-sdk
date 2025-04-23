import childProcess, { ChildProcess } from "node:child_process";
import events from "node:events";
import fs from "node:fs/promises";
import path from "node:path";
import util from "node:util";
import { stripAnsi } from "miniflare";
import kill from "tree-kill";
import { test as baseTest, inject, onTestFailed, vi } from "vitest";
import vitePluginPackage from "../package.json";

const debuglog = util.debuglog("vite-plugin:test");

const testEnv = {
	...process.env,
	// The following env vars are set to ensure that package managers
	// do not use the same global cache and accidentally hit race conditions.
	YARN_CACHE_FOLDER: "./.yarn/cache",
	YARN_ENABLE_GLOBAL_CACHE: "false",
	PNPM_HOME: "./.pnpm",
	npm_config_cache: "./.npm/cache",
	// unset the VITEST env variable as this causes e2e issues with some frameworks
	VITEST: undefined,
};

/**
 * Extends the Vitest `test()` function to support running vite in
 * well defined environments that represent real-world usage.
 */
export const test = baseTest.extend<{
	seed: (fixture: string, pm: "npm" | "pnpm" | "yarn") => Promise<string>;
	runLongLived: (
		pm: string,
		command: "dev" | "preview",
		projectPath: string,
		options?: { flags?: string[]; maxBuffer?: number }
	) => Promise<Process>;
}>({
	/** Seed a test project from a fixture. */
	async seed({}, use) {
		const root = inject("root");
		const projectPaths: string[] = [];
		await use(async (fixture, pm) => {
			const projectPath = path.resolve(root, fixture);
			// We need to delete previous seeded files because, if the a node_modules was created by pnpm,
			// you might get `npm error Cannot read properties of null (reading 'matches')`.
			fs.rm(projectPath, { force: true, maxRetries: 10, recursive: true });
			await fs.cp(path.resolve(__dirname, "fixtures", fixture), projectPath, {
				recursive: true,
				errorOnExist: true,
			});
			debuglog("Fixture copied to " + projectPath);
			await updateVitePluginVersion(projectPath);
			debuglog("Updated vite-plugin version in package.json");
			runCommand(`${pm} install`, projectPath, { attempts: 2 });
			debuglog("Installed node modules");
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
	async runLongLived({}, use) {
		let process: ChildProcess | undefined;
		await use(async (pm, command, projectPath) => {
			debuglog(`starting \`${command}\` for ${projectPath}`);
			const proc = childProcess.exec(`${pm} run ${command}`, {
				cwd: projectPath,
				env: testEnv,
			});
			process = proc;
			return wrap(proc);
		});
		debuglog(`Closing down process`);
		const result = await new Promise<number | undefined>((resolve, reject) => {
			const pid = process?.pid;
			if (!pid) {
				resolve(undefined);
			} else {
				debuglog(`Killing process, id:${pid}`);
				kill(pid, "SIGKILL", (error) => (error ? reject(error) : resolve(pid)));
			}
		});
		if (result) {
			debuglog("Killed process", result);
		} else {
			debuglog("Process had no pid");
		}
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

async function updateVitePluginVersion(projectPath: string) {
	const pkg = JSON.parse(
		await fs.readFile(path.resolve(projectPath, "package.json"), "utf8")
	);
	const fields = ["dependencies", "devDependencies", "peerDependencies"];
	for (const field of fields) {
		if (pkg[field]?.["@cloudflare/vite-plugin"]) {
			pkg[field]["@cloudflare/vite-plugin"] = vitePluginPackage.version;
		}
	}
	await fs.writeFile(
		path.resolve(projectPath, "package.json"),
		JSON.stringify(pkg, null, 2)
	);
}

export function runCommand(
	command: string,
	cwd: string,
	{ attempts = 1 } = {}
) {
	while (attempts > 0) {
		debuglog("Running command:", command);
		try {
			childProcess.execSync(command, {
				cwd,
				stdio: debuglog.enabled ? "inherit" : "ignore",
				env: testEnv,
			});
			break;
		} catch (e) {
			attempts--;
			if (attempts > 0) {
				debuglog(`Retrying failed command (${e})`);
			} else {
				throw e;
			}
		}
	}
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
