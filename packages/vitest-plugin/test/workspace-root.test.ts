import childProcess from "node:child_process";
import events from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { removeDir } from "@cloudflare/workers-utils";
import { stripAnsi } from "miniflare";
import dedent from "ts-dedent";
import { inject } from "vitest";
import { test, vitestConfig } from "./helpers";

/**
 * Seeds a workspace like the one in
 * https://github.com/cloudflare/workers-sdk/issues/17107: the `worker/` package
 * depends on `vitest` and `@cloudflare/vitest-plugin`, while the workspace root
 * doesn't. The workspace is created outside the shared installation, so neither
 * its root nor any parent directory has a `node_modules/vitest`, and
 * `worker/node_modules` links to the installation's `node_modules`.
 */
async function seedWorkspace(files: Record<string, string> = {}) {
	const tmpPoolInstallationPath = inject("tmpPoolInstallationPath");
	const workspacePath = await fs.realpath(
		await fs.mkdtemp(path.join(os.tmpdir(), "vitest-plugin-workspace-"))
	);
	const seeded: Record<string, string> = {
		"package.json": JSON.stringify({ name: "workspace-root", private: true }),
		"worker/package.json": JSON.stringify({
			name: "worker",
			private: true,
			type: "module",
		}),
		"worker/vitest.config.mts": vitestConfig(),
		"worker/test/index.test.ts": dedent`
			import { it } from "vitest";

			it("runs inside workerd", ({ expect }) => {
				expect(navigator.userAgent).toBe("Cloudflare-Workers");
			});
		`,
		...files,
	};
	for (const [name, contents] of Object.entries(seeded)) {
		const filePath = path.join(workspacePath, name);
		await fs.mkdir(path.dirname(filePath), { recursive: true });
		await fs.writeFile(filePath, contents);
	}
	await fs.symlink(
		path.join(tmpPoolInstallationPath, "node_modules"),
		path.join(workspacePath, "worker", "node_modules"),
		"junction"
	);
	return workspacePath;
}

/**
 * Runs `worker/node_modules/.bin/vitest run --config worker/vitest.config.mts`
 * from the workspace root, as the reporter's root `test` script does, so the
 * Vite root is the workspace root.
 */
async function runFromWorkspaceRoot(workspacePath: string) {
	const vitestBin = path.join(
		workspacePath,
		"worker",
		"node_modules",
		"vitest",
		"vitest.mjs"
	);
	const proc = childProcess.spawn(
		process.execPath,
		[vitestBin, "run", "--config", "worker/vitest.config.mts"],
		{
			cwd: workspacePath,
			env: {
				...process.env,
				CI: undefined,
				GITHUB_ACTIONS: undefined,
				PWD: workspacePath,
			},
			stdio: ["ignore", "pipe", "pipe"],
		}
	);
	let output = "";
	proc.stdout.setEncoding("utf8");
	proc.stderr.setEncoding("utf8");
	proc.stdout.on("data", (chunk: string) => (output += chunk));
	proc.stderr.on("data", (chunk: string) => (output += chunk));
	const [exitCode] = await events.once(proc, "close");
	return { exitCode, output: stripAnsi(output) };
}

test(
	"runs tests when Vitest runs from a workspace root that can't resolve vitest",
	{ timeout: 60_000 },
	async ({ expect, onTestFinished }) => {
		const workspacePath = await seedWorkspace();
		onTestFinished(() => removeDir(workspacePath));

		const { exitCode, output } = await runFromWorkspaceRoot(workspacePath);

		expect(output).not.toContain(`No such module "vitest/worker"`);
		expect(output).toMatch(/Tests\s+1 passed/);
		expect(exitCode, output).toBe(0);
	}
);

test(
	"loads the runner from the plugin's vitest, not a workspace root's other vitest",
	{ timeout: 60_000 },
	async ({ expect, onTestFinished }) => {
		// Stands in for another version of `vitest` installed at the workspace
		// root, which the `worker/` package doesn't use. Every entry point throws,
		// so loading any of it fails with a recognisable message.
		const workspacePath = await seedWorkspace({
			"node_modules/vitest/package.json": JSON.stringify({
				name: "vitest",
				version: "0.0.0-workspace-root",
				type: "module",
				exports: { ".": "./other.js", "./*": "./other.js" },
			}),
			"node_modules/vitest/other.js": dedent`
				throw new Error("Loaded the workspace root's other vitest");
			`,
		});
		onTestFinished(() => removeDir(workspacePath));

		const { exitCode, output } = await runFromWorkspaceRoot(workspacePath);

		expect(output).not.toContain("Loaded the workspace root's other vitest");
		expect(output).toMatch(/Tests\s+1 passed/);
		expect(exitCode, output).toBe(0);
	}
);
