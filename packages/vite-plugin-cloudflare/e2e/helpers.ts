import assert from "node:assert";
import childProcess from "node:child_process";
import events from "node:events";
import fs from "node:fs/promises";
import path from "node:path";
import util from "node:util";
import { stripAnsi } from "miniflare";
import kill from "tree-kill";
import {
	afterAll,
	beforeAll,
	inject,
	onTestFailed,
	onTestFinished,
	vi,
} from "vitest";
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

const strictPeerDeps = {
	pnpm: "--strict-peer-dependencies",
	npm: "--strict-peer-deps",
	// yarn does not have an option for strict checks
	yarn: "",
};

/** Seed a test project from a fixture. */
export function seed(
	fixture: string,
	pm: "pnpm" | "yarn" | "npm",
	replacements: Record<string, string> = {}
) {
	const root = inject("root");
	const projectPath = path.resolve(root, fixture, pm);

	beforeAll(async () => {
		await fs.cp(path.resolve(__dirname, "fixtures", fixture), projectPath, {
			recursive: true,
			errorOnExist: true,
		});
		debuglog("Fixture copied to " + projectPath);
		await updateVitePluginVersion(projectPath);
		debuglog("Fixing up replacements in seeded files");
		await fixupReplacements(projectPath, replacements);
		debuglog("Updated vite-plugin version in package.json");
		runCommand(`${pm} install ${strictPeerDeps[pm]}`, projectPath, {
			attempts: 2,
		});
		debuglog("Installed node modules");
	}, 200_000);

	afterAll(async () => {
		if (!process.env.CLOUDFLARE_VITE_E2E_KEEP_TEMP_DIRS) {
			debuglog("Deleting project path", projectPath);
			await fs.rm(projectPath, {
				force: true,
				recursive: true,
				maxRetries: 10,
			});
		}
	}, 40_000);

	return projectPath;
}

export type AnyString = string & {};

/** Starts a command and wraps its outputs. */
export async function runLongLived(
	pm: "pnpm" | "yarn" | "npm",
	command: "dev" | "buildAndPreview" | AnyString,
	projectPath: string,
	customEnv: Record<string, string | undefined> = {}
) {
	debuglog(`starting \`${command}\` for ${projectPath}`);
	const process = childProcess.exec(`${pm} run ${command}`, {
		cwd: projectPath,
		env: {
			...testEnv,
			...customEnv,
		},
	});

	onTestFinished(async () => {
		debuglog(`Closing down process`);
		const result = await new Promise<number | undefined>((resolve) => {
			const pid = process?.pid;
			if (!pid) {
				resolve(undefined);
			} else {
				debuglog(`Killing process, id:${pid}`);
				kill(pid, "SIGKILL", (error) => {
					if (error) {
						debuglog("Error killing process", error);
					}
					resolve(pid);
				});
			}
		});
		if (result) {
			debuglog("Killed process", result);
		} else {
			debuglog("Process had no pid");
		}
	});
	return wrap(process);
}

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

/**
 * Runs a short-running command in a child process.
 *
 * Will attempt to run the command `attempts` times, retrying on failure.
 * If `canFail` is true, the command will not throw when it runs out of attempts.
 * If `timeout` is set, each attempt will be killed after the specified time in milliseconds.
 */
export function runCommand(
	command: string,
	cwd: string,
	{ attempts = 1, canFail = false, timeout = 0 } = {}
) {
	while (attempts > 0) {
		debuglog("Running command:", command);
		try {
			const output = childProcess.execSync(command, {
				cwd,
				stdio: "pipe",
				env: testEnv,
				timeout,
				encoding: "utf8",
			});
			if (debuglog.enabled) {
				process.stdout.write(output);
			}
			return output;
		} catch (e) {
			attempts--;
			if (attempts > 0) {
				debuglog(`Retrying failed command (${e})`);
			} else if (canFail) {
				debuglog(`Command failed but canFail is true, not throwing: ${e}`);
			} else {
				throw e;
			}
		}
	}
}

function getWranglerCommand(command: string) {
	// Enforce a `wrangler` prefix to make commands clearer to read
	assert(
		command.startsWith("wrangler "),
		"Commands must start with `wrangler` (e.g. `wrangler dev`) but got " +
			command
	);
	const wranglerBin = path.resolve(
		`${__dirname}/../../../packages/wrangler/bin/wrangler.js`
	);
	return `node ${wranglerBin} ${command.slice("wrangler ".length)}`;
}

export async function runWrangler(
	wranglerCommand: string,
	{ cwd }: { cwd?: string } = {}
) {
	return runCommand(getWranglerCommand(wranglerCommand), cwd);
}

/**
 * Fetches JSON data from the `url` using the `info` to create the request.
 *
 * Will retry the fetch if it fails or times out (5 seconds), waiting 1 second between attempts.
 * If the request has still not succeeded after 20 secs it will fail.
 */
export async function fetchJson(url: string, info?: RequestInit) {
	return vi.waitFor(
		async () => {
			try {
				const response = await fetch(url, {
					headers: { "MF-Disable-Pretty-Error": "true" },
					...info,
					signal: AbortSignal.timeout(10_000),
				});
				const text = await response.text();
				try {
					return JSON.parse(text) as unknown;
				} catch (cause) {
					const err = new Error(`Failed to parse JSON from:\n${text}`);
					err.cause = cause;
					throw err;
				}
			} catch (error) {
				console.error("Failed to fetch JSON from:" + url, error);
				throw error;
			}
		},
		{ timeout: 40_000, interval: 1000 }
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

async function fixupReplacements(
	projectPath: string,
	replacements: Record<string, string>
) {
	const files = await fs.readdir(projectPath, { withFileTypes: true });
	for (const file of files) {
		if (file.isDirectory()) {
			await fixupReplacements(path.join(projectPath, file.name), replacements);
		} else if (file.isFile()) {
			let content = await fs.readFile(
				path.join(projectPath, file.name),
				"utf8"
			);
			for (const [key, value] of Object.entries(replacements)) {
				content = content.replaceAll(key, value);
			}
			await fs.writeFile(path.join(projectPath, file.name), content, "utf8");
		}
	}
}

/**
 * `buildAndPreview` commands (i.e. `vite build && vite preview`) don't work in CI on windows
 * this needs to be investigated and solved: https://jira.cfdata.org/browse/DEVX-2030
 *
 * This minimal utility simply detects if the command is being tested on windows
 *
 * @param command the command being tested (either 'dev' or 'buildAndPreview')
 * @returns true is the command is buildAndPreview and the os is windows
 */
export function isBuildAndPreviewOnWindows(command: "dev" | "buildAndPreview") {
	const isWindows = process.platform === "win32";
	return isWindows && command === "buildAndPreview";
}
