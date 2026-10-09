import { spawnSync } from "node:child_process";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "vitest";
import { clean } from "../../clean/clean";

const repository = path.resolve(__dirname, "../../..");
const packages = {
	tools: "@cloudflare/tools",
	"fixtures/node-env": "@fixture/node-env",
	"packages/workers-auth": "@cloudflare/workers-auth",
};

interface Task {
	taskId: string;
	task: string;
	hash: string;
}

describe("Turbo test cache inputs", () => {
	let root: string;

	beforeEach(() => {
		root = realpathSync(mkdtempSync(path.join(tmpdir(), "turbo-inputs-")));
		// Turbo's Git hashing includes root inputs outside the package directory.
		const git = spawnSync("git", ["init", "--quiet"], {
			cwd: root,
			encoding: "utf8",
		});
		if (git.status !== 0) {
			throw new Error(`Cannot initialise test repository: ${git.stderr}`);
		}
		writeFileSync(
			path.join(root, "turbo.json"),
			readFileSync(path.join(repository, "turbo.json"))
		);
		const { packageManager } = JSON.parse(
			readFileSync(path.join(repository, "package.json"), "utf8")
		);
		writeFileSync(
			path.join(root, "package.json"),
			JSON.stringify({
				name: "cache-input-test",
				private: true,
				packageManager,
			})
		);
		writeFileSync(
			path.join(root, "pnpm-workspace.yaml"),
			"packages:\n  - tools\n  - fixtures/*\n  - packages/*\n"
		);
		writeFileSync(
			path.join(root, "pnpm-lock.yaml"),
			"lockfileVersion: '9.0'\nimporters:\n  .: {}\n" +
				Object.keys(packages)
					.map((directory) => `  ${directory}: {}\n`)
					.join("")
		);
		writeFileSync(path.join(root, ".gitignore"), "node_modules\n.turbo\n");
		for (const [directory, name] of Object.entries(packages)) {
			mkdirSync(path.join(root, directory), { recursive: true });
			writeFileSync(
				path.join(root, directory, "package.json"),
				JSON.stringify({
					name,
					scripts: { build: "node --version", "test:ci": "node --version" },
				})
			);
			writeFileSync(path.join(root, directory, "test.ts"), "export {};\n");
		}
		writeFileSync(
			path.join(root, "tools/turbo.json"),
			readFileSync(path.join(repository, "tools/turbo.json"))
		);
		writeFileSync(path.join(root, "vitest.shared.ts"), "export {};\n");
		mkdirSync(path.join(root, "fixtures/shared/src"), { recursive: true });
		writeFileSync(
			path.join(root, "fixtures/shared/src/helper.ts"),
			"export {};\n"
		);
		// A HEAD commit is required for Turbo to use Git rather than its fallback.
		const index = spawnSync("git", ["add", "."], {
			cwd: root,
			encoding: "utf8",
		});
		const commit = spawnSync(
			"git",
			[
				"-c",
				"user.name=CI",
				"-c",
				"user.email=ci@example.invalid",
				"-c",
				"commit.gpgsign=false",
				"commit",
				"--quiet",
				"-m",
				"Test cache inputs",
			],
			{ cwd: root, encoding: "utf8" }
		);
		if (index.status !== 0 || commit.status !== 0) {
			throw new Error(
				`Cannot commit test inputs: ${index.stderr}${commit.stderr}`
			);
		}
	});

	afterEach(() => clean([root]));

	function plan(nodeVersion = "v22.22.1"): Task[] {
		const result = spawnSync(
			process.execPath,
			[
				require.resolve("turbo/bin/turbo"),
				"run",
				"test:ci",
				"--dry=json",
				"--no-daemon",
			],
			{
				cwd: root,
				encoding: "utf8",
				env: { ...process.env, NODE_VERSION: nodeVersion },
			}
		);
		if (result.status !== 0) {
			throw new Error(`Turbo dry run failed: ${result.stderr}`);
		}
		return JSON.parse(result.stdout).tasks;
	}

	function hashes(tasks: Task[], name: string) {
		return Object.fromEntries(
			tasks
				.filter(({ task }) => task === name)
				.map(({ taskId, hash }) => [taskId, hash])
		);
	}

	it.for(["vitest.shared.ts", "fixtures/shared/src/helper.ts"])(
		"invalidates tests when %s changes without invalidating builds",
		(file, { expect }) => {
			const before = plan();
			writeFileSync(path.join(root, file), "export const changed = true;\n");
			const after = plan();
			expect(hashes(after, "build")).toEqual(hashes(before, "build"));
			const testsBefore = hashes(before, "test:ci");
			const testsAfter = hashes(after, "test:ci");
			expect(Object.keys(testsAfter)).toHaveLength(3);
			for (const [task, hash] of Object.entries(testsAfter)) {
				expect(hash, task).not.toBe(testsBefore[task]);
			}
		}
	);

	it("hashes the Node.js runtime version", ({ expect }) => {
		const before = hashes(plan(), "test:ci");
		const after = hashes(plan("v22.23.1"), "test:ci");
		expect(Object.keys(after)).toHaveLength(3);
		for (const [task, hash] of Object.entries(after)) {
			expect(hash, task).not.toBe(before[task]);
		}
	});
});
