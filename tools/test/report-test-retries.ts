import {
	appendFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	writeFileSync,
} from "node:fs";
import path from "node:path";
import { stripVTControlCharacters } from "node:util";

interface RetriedTest {
	task: string;
	file: string;
	test: string;
	outcome: "passed" | "failed";
	retries: number;
	durationMs: number;
}

interface TurboTask {
	taskId: string;
	task: string;
	logFile: string;
	cache: { status: string };
	execution?: { startTime: number };
}

/** Extract Vitest's final retry results, including retries in successful runs. */
export function parseTestRetries(log: string, task: string): RetriedTest[] {
	const retries: RetriedTest[] = [];
	let file = "";
	for (const line of stripVTControlCharacters(log).split(/\r?\n/)) {
		const module = /^\s*[✓❯×] (.+?) \(\d+ tests?\b/.exec(line);
		if (module) {
			file = module[1];
		}
		const test = /^\s*([✓×]) (.+?)\s+(\d+)ms \(retry x(\d+)\)\s*$/.exec(line);
		if (test && file) {
			retries.push({
				task,
				file,
				test: test[2],
				outcome: test[1] === "✓" ? "passed" : "failed",
				durationMs: Number(test[3]),
				retries: Number(test[4]),
			});
		}
	}
	return retries;
}

/** Read executed test tasks, excluding retry results replayed from Turbo's cache. */
export function collectTestRetries(root: string) {
	const runs = path.join(root, ".turbo/runs");
	const tasks = new Map<string, TurboTask>();
	for (const file of existsSync(runs) ? readdirSync(runs) : []) {
		if (!file.endsWith(".json")) {
			continue;
		}
		const run = JSON.parse(readFileSync(path.join(runs, file), "utf8")) as {
			tasks: TurboTask[];
		};
		for (const task of run.tasks) {
			if (task.task !== "test:ci" || !task.execution) {
				continue;
			}
			// A later invocation can overwrite the same task log. Match that log
			// to its latest execution instead of counting it once per summary.
			const previous = tasks.get(task.logFile);
			if (
				!previous ||
				task.execution.startTime > (previous.execution?.startTime ?? 0)
			) {
				tasks.set(task.logFile, task);
			}
		}
	}
	const retries: RetriedTest[] = [];
	const missingLogs: string[] = [];
	let cachedTasks = 0;
	let scannedTasks = 0;
	for (const task of tasks.values()) {
		if (task.cache.status === "HIT") {
			cachedTasks++;
			continue;
		}
		const log = path.resolve(root, task.logFile);
		if (!existsSync(log)) {
			missingLogs.push(task.taskId);
			continue;
		}
		scannedTasks++;
		retries.push(...parseTestRetries(readFileSync(log, "utf8"), task.taskId));
	}
	return {
		scannedTasks,
		cachedTasks,
		missingLogs,
		retries: retries.sort((a, b) => b.durationMs - a.durationMs),
	};
}

function escapeCell(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll("|", "&#124;")
		.replaceAll("`", "&#96;");
}

/** Render retry counts and combined attempt durations without estimating retry cost. */
export function formatTestRetries(
	report: ReturnType<typeof collectTestRetries>,
	attempt: string
): string {
	const lines = [
		"### Test retries",
		"",
		`Workflow attempt: ${escapeCell(attempt)}. Scanned ${report.scannedTasks} fresh test tasks; excluded ${report.cachedTasks} cached tasks.`,
		"",
	];
	if (report.retries.length) {
		lines.push(
			"| Task / file | Test | Final result | Retries | Total test time |",
			"| --- | --- | --- | ---: | ---: |",
			...report.retries.map(
				(test) =>
					`| ${escapeCell(test.task)} / ${escapeCell(test.file)} | ${escapeCell(test.test)} | ${test.outcome} | ${test.retries} | ${(test.durationMs / 1000).toFixed(2)}s |`
			),
			"",
			"Total test time includes all attempts and their hooks; it is not the time spent only on retries."
		);
	} else {
		lines.push("No Vitest retry markers found in the scanned tasks.");
	}
	if (report.missingLogs.length) {
		lines.push(
			"",
			`Missing logs: ${report.missingLogs.map(escapeCell).join(", ")}.`
		);
	}
	lines.push(
		"",
		"This reports Vitest test retries, not assertion polling or retries inside custom test commands. A cancelled run may have incomplete logs.",
		""
	);
	return lines.join("\n");
}

/* eslint-disable turbo/no-undeclared-env-vars -- This CI reporting CLI runs outside Turbo and does not affect task cache keys. */
if (require.main === module) {
	const root = process.cwd();
	const report = {
		workflowAttempt: process.env.GITHUB_RUN_ATTEMPT ?? "local",
		...collectTestRetries(root),
	};
	mkdirSync(path.join(root, ".turbo"), { recursive: true });
	writeFileSync(
		path.join(root, ".turbo/test-retries.json"),
		JSON.stringify(report, null, 2) + "\n"
	);
	const summary = formatTestRetries(report, report.workflowAttempt);
	if (process.env.GITHUB_STEP_SUMMARY) {
		appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
	}
	console.log(summary);
}
