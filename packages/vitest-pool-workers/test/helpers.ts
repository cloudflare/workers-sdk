/* eslint-disable no-empty-pattern */
import childProcess from "node:child_process";
import events from "node:events";
import fs from "node:fs/promises";
import path from "node:path";
import util from "node:util";
import { stripAnsi } from "miniflare";
import { test as baseTest, inject, vi } from "vitest";

const debuglog = util.debuglog("vitest-pool-workers:test");

export const minimalVitestConfig = `
import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";
export default defineWorkersConfig({
	test: {
		testTimeout: 90_000,
		poolOptions: {
			workers: {
				singleWorker: true,
				miniflare: {
					compatibilityDate: "2024-01-01",
					compatibilityFlags: ["nodejs_compat"],
				},
			},
		},
	}
});
`;

export function waitFor<T>(callback: Parameters<typeof vi.waitFor<T>>[0]) {
	// The default timeout of `vi.waitFor()` is only 1s, which is a little
	// short for some of these tests, especially on Windows.
	return vi.waitFor(callback, { timeout: 10_000, interval: 500 });
}

async function seed(root: string, files: Record<string, string>) {
	for (const [name, contents] of Object.entries(files)) {
		const filePath = path.resolve(root, name);
		await fs.mkdir(path.dirname(filePath), { recursive: true });
		await fs.writeFile(filePath, contents);
	}
}

export interface Process {
	readonly stdout: string;
	readonly stderr: string;
	readonly exitCode: Promise<number>;
}

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
			return closePromise.then(
				([exitCode, signal]) => exitCode ?? signal ?? -1
			);
		},
	};
}

export const test = baseTest.extend<{
	tmpPath: string;
	seed: (files: Record<string, string>) => Promise<void>;
	vitestRun: (options?: {
		flags?: string[];
		maxBuffer?: number;
	}) => Promise<Process>;
	vitestDev: (options?: { flags?: string[]; maxBuffer?: number }) => Process;
}>({
	// Fixture for creating a temporary directory
	async tmpPath({}, use) {
		const tmpPoolInstallationPath = inject("tmpPoolInstallationPath");
		const tmpPathBase = path.join(tmpPoolInstallationPath, "test-");
		const tmpPath = await fs.mkdtemp(tmpPathBase);
		await use(tmpPath);
		await fs.rm(tmpPath, { recursive: true, maxRetries: 10 });
	},
	// Fixture for seeding data in the temporary directory
	async seed({ tmpPath }, use) {
		await use((files) => seed(tmpPath, files));
	},
	// Fixture for a starting single-shot `vitest run` process
	async vitestRun({ tmpPath }, use) {
		const tmpPoolInstallationPath = inject("tmpPoolInstallationPath");

		await use(async ({ flags = [], maxBuffer } = {}) => {
			const proc = childProcess.exec(
				`pnpm exec vitest run --root="${tmpPath}" ` + flags.join(" "),
				{
					cwd: tmpPoolInstallationPath,
					env: getNoCIEnv(),
					maxBuffer,
				}
			);
			const wrapped = wrap(proc);
			await wrapped.exitCode;
			return wrapped;
		});
	},
	// Fixture for a starting long-running `vitest dev` process
	async vitestDev({ tmpPath }, use) {
		const tmpPoolInstallationPath = inject("tmpPoolInstallationPath");
		const processes: childProcess.ChildProcess[] = [];

		await use(({ flags = [], maxBuffer } = {}) => {
			const proc = childProcess.exec(
				`pnpm exec vitest dev --root="${tmpPath}" ` + flags.join(" "),
				{
					cwd: tmpPoolInstallationPath,
					env: getNoCIEnv(),
					maxBuffer,
				}
			);
			processes.push(proc);
			return wrap(proc);
		});

		// Kill all processes after the test
		for (const proc of processes) {
			proc.kill();
		}
	},
});

/**
 * Get a copy of the process.env that will not be interpreted by Vitest as running in CI.
 *
 * This is important for the snapshot update tests to execute correctly.
 * Vitest uses the `std-env` library's `isCI()` call to determine this.
 * Since we currently use GitHub Actions to run our CI jobs, this is what we are turning off here.
 * If we change CI provider then we should update this.
 */
function getNoCIEnv(): typeof process.env {
	const env = { ...process.env };
	env.CI = undefined;
	env.GITHUB_ACTIONS = undefined;
	// Suppress Node.js deprecation warnings in spawned processes to prevent
	// them from appearing in stderr (which breaks tests that assert stderr is empty)
	env.NODE_OPTIONS = [env.NODE_OPTIONS, "--no-deprecation"]
		.filter(Boolean)
		.join(" ");
	return env;
}
