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
import {
	collectTestRetries,
	formatTestRetries,
	parseTestRetries,
} from "../report-test-retries";

const log = [
	" ✓ tests/green.test.ts (3 tests) 2300ms",
	"   ✓ passes immediately 10ms",
	"   \x1b[33m✓ eventually passes 2200ms (retry x2)\x1b[39m",
	" ❯ tests/red.test.ts (1 test | 1 failed) 600ms",
	"   × still fails 600ms (retry x1)",
	"stdout: deliberately tests application retry behavior",
].join("\r\n");

describe("test retry reports", () => {
	let root: string;
	beforeEach(() => {
		root = realpathSync(mkdtempSync(path.join(tmpdir(), "test-retries-")));
		mkdirSync(path.join(root, ".turbo/runs"), { recursive: true });
	});
	afterEach(() => clean([root]));

	it("extracts successful and exhausted retries from coloured Vitest logs", ({
		expect,
	}) => {
		expect(parseTestRetries(log, "fixture#test:ci")).toEqual([
			{
				task: "fixture#test:ci",
				file: "tests/green.test.ts",
				test: "eventually passes",
				outcome: "passed",
				durationMs: 2200,
				retries: 2,
			},
			{
				task: "fixture#test:ci",
				file: "tests/red.test.ts",
				test: "still fails",
				outcome: "failed",
				durationMs: 600,
				retries: 1,
			},
		]);
	});

	function task(name: string, startTime = 1, status = "MISS") {
		const logFile = `.turbo/${name}.log`;
		writeFileSync(path.join(root, logFile), log);
		return {
			taskId: `${name}#test:ci`,
			task: "test:ci",
			logFile,
			cache: { status },
			execution: { startTime },
		};
	}

	it("ignores cache replays, build logs and tasks that never executed", ({
		expect,
	}) => {
		writeFileSync(
			path.join(root, ".turbo/runs/1.json"),
			JSON.stringify({
				tasks: [
					task("fresh"),
					task("cached", 1, "HIT"),
					{ ...task("build"), task: "build" },
					{ ...task("not-run"), execution: undefined },
					{ ...task("missing"), logFile: "missing.log" },
				],
			})
		);
		expect(collectTestRetries(root)).toMatchObject({
			scannedTasks: 1,
			cachedTasks: 1,
			missingLogs: ["missing#test:ci"],
			retries: [{ task: "fresh#test:ci" }, { task: "fresh#test:ci" }],
		});
	});

	it("uses the latest invocation when multiple summaries refer to the same log", ({
		expect,
	}) => {
		writeFileSync(
			path.join(root, ".turbo/runs/a.json"),
			JSON.stringify({ tasks: [task("same", 2, "HIT")] })
		);
		writeFileSync(
			path.join(root, ".turbo/runs/z.json"),
			JSON.stringify({ tasks: [task("same", 1)] })
		);
		expect(collectTestRetries(root)).toEqual({
			scannedTasks: 0,
			cachedTasks: 1,
			missingLogs: [],
			retries: [],
		});
	});

	it("reads independently captured uncached output and excludes cached replays", ({
		expect,
	}) => {
		mkdirSync(path.join(root, ".turbo/ci-logs"));
		writeFileSync(
			path.join(root, ".turbo/ci-logs/packages.log"),
			["fresh", "cached"]
				.flatMap((name) =>
					log.split("\r\n").map((line) => `${name}:test:ci: ${line}`)
				)
				.join("\n")
		);
		writeFileSync(
			path.join(root, ".turbo/runs/1.json"),
			JSON.stringify({
				tasks: [
					{ ...task("fresh"), logFile: "no-writes-fresh.log" },
					{ ...task("cached", 1, "HIT"), logFile: "no-writes-cached.log" },
				],
			})
		);
		expect(collectTestRetries(root)).toMatchObject({
			scannedTasks: 1,
			cachedTasks: 1,
			missingLogs: [],
			retries: [{ task: "fresh#test:ci" }, { task: "fresh#test:ci" }],
		});
	});

	it("writes the JSON artifact and GitHub summary through the CLI", ({
		expect,
	}) => {
		writeFileSync(
			path.join(root, ".turbo/runs/1.json"),
			JSON.stringify({ tasks: [task("fresh")] })
		);
		const summaryPath = path.join(root, "summary.md");
		const result = spawnSync(
			process.execPath,
			[
				"-r",
				require.resolve("esbuild-register"),
				path.resolve(__dirname, "../report-test-retries.ts"),
			],
			{
				cwd: root,
				encoding: "utf8",
				env: {
					...process.env,
					GITHUB_STEP_SUMMARY: summaryPath,
					GITHUB_RUN_ATTEMPT: "2",
				},
			}
		);
		expect(result.status, result.stderr).toBe(0);
		expect(
			JSON.parse(
				readFileSync(path.join(root, ".turbo/test-retries.json"), "utf8")
			)
		).toEqual({ workflowAttempt: "2", ...collectTestRetries(root) });
		const summary = readFileSync(summaryPath, "utf8");
		expect(summary).toContain("Workflow attempt: 2");
		expect(summary).toContain("| eventually passes | passed | 2 | 2.20s |");
		expect(summary).toContain("| still fails | failed | 1 | 0.60s |");
	});

	it("reports limited coverage and escapes Markdown and HTML in test names", ({
		expect,
	}) => {
		const report = collectTestRetries(root);
		expect(formatTestRetries(report, "1")).toContain(
			"No Vitest retry markers found in the scanned tasks."
		);
		expect(
			formatTestRetries(
				{
					...report,
					missingLogs: ["absent#test:ci"],
					retries: parseTestRetries(
						log.replace("eventually passes", "<tag> | `code` & text"),
						"fixture#test:ci"
					),
				},
				"1"
			)
		).toContain("&lt;tag&gt; &#124; &#96;code&#96; &amp; text");
	});
});
