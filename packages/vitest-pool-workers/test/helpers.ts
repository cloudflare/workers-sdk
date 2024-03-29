/* eslint-disable no-empty-pattern */
import childProcess from "node:child_process";
import events from "node:events";
import fs from "node:fs/promises";
import path from "node:path";
import util from "node:util";
import { test as baseTest, inject, vi } from "vitest";

const debuglog = util.debuglog("vitest-pool-workers:test");

export const minimalVitestConfig = `
import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";
export default defineWorkersConfig({
	test: {
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

function wrap(proc: childProcess.ChildProcessWithoutNullStreams): Process {
	let stdout = "";
	let stderr = "";
	proc.stdout.setEncoding("utf8");
	proc.stderr.setEncoding("utf8");
	proc.stdout.on("data", (chunk) => {
		if (debuglog.enabled) process.stdout.write(chunk);
		stdout += chunk;
	});
	proc.stderr.on("data", (chunk) => {
		if (debuglog.enabled) process.stderr.write(chunk);
		stderr += chunk;
	});
	const closePromise = events.once(proc, "close");
	return {
		get stdout() {
			return stdout;
		},
		get stderr() {
			return stderr;
		},
		get exitCode() {
			return closePromise.then(([exitCode]) => exitCode ?? -1);
		},
	};
}

export const test = baseTest.extend<{
	tmpPath: string;
	seed: (files: Record<string, string>) => Promise<void>;
	vitestRun: (...flags: string[]) => Promise<Process>;
	vitestDev: (...flags: string[]) => Process;
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

		await use(async (...flags) => {
			const proc = childProcess.spawn(
				"pnpm",
				["exec", "vitest", "run", "--root", tmpPath, ...flags],
				{ cwd: tmpPoolInstallationPath }
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

		await use((...flags) => {
			const proc = childProcess.spawn(
				"pnpm",
				["exec", "vitest", "dev", "--root", tmpPath, ...flags],
				{ cwd: tmpPoolInstallationPath }
			);
			processes.push(proc);
			return wrap(proc);
		});

		// Kill all processes after the test
		for (const proc of processes) proc.kill();
	},
});
