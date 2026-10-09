import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { it } from "vitest";

const repository = path.resolve(__dirname, "../../..");
const workflow = readFileSync(
	path.join(repository, ".github/workflows/test-and-check.yml"),
	"utf8"
);

/** Resolve the package filters from the commands CI actually executes. */
function filtersFor(log: string, platform: string): string[] {
	const command = workflow
		.split("\n")
		.find((line) => line.includes(`test:ci:logged .turbo/ci-logs/${log}.log`));
	if (command === undefined) {
		throw new Error(`Missing CI command for ${log}`);
	}
	const resolved = command.replace(
		/\$\{\{ matrix.os != 'windows-latest' && '([^']*)' \|\| '' \}\}/g,
		(_, nonWindows: string) => (platform === "win32" ? "" : nonWindows)
	);
	if (resolved.includes("${{")) {
		throw new Error(`Unresolved CI expression in ${log}`);
	}
	return Array.from(resolved.matchAll(/--filter="([^"]+)"/g), (match) =>
		String(match[1])
	);
}

/** Ask Turbo for real executable test tasks without building or running them. */
function testTasks(filters: string[]): string[] {
	const result = spawnSync(
		process.execPath,
		[
			require.resolve("turbo/bin/turbo"),
			"run",
			"test:ci",
			"--dry=json",
			"--no-daemon",
			...filters.map((filter) => `--filter=${filter}`),
		],
		{ cwd: repository, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 }
	);
	if (result.status !== 0) {
		throw new Error(`Turbo dry run failed: ${result.stderr}`);
	}
	const { tasks } = JSON.parse(result.stdout) as {
		tasks: { taskId: string; task: string; command: string }[];
	};
	return tasks
		.filter(
			({ task, command }) =>
				task === "test:ci" && command && command !== "<NONEXISTENT>"
		)
		.map(({ taskId }) => taskId)
		.sort();
}

it.for(["darwin", "linux", "win32"])(
	"preserves every eligible package test exactly once across partitions on %s",
	(platform, { expect }) => {
		const original = testTasks([
			"./packages/*",
			...(platform === "win32" ? ["!./packages/vitest-plugin"] : []),
		]);
		const partitioned = [
			...testTasks(filtersFor("packages", platform)),
			...testTasks(filtersFor("integrations", platform)),
			...testTasks(["wrangler", "miniflare"]),
		];
		expect(original.length).toBeGreaterThan(0);
		expect(partitioned.sort()).toEqual(original);
		expect(new Set(partitioned).size).toBe(original.length);
	}
);
