import assert from "node:assert";
import { spawn, spawnSync } from "node:child_process";
import {
	appendFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { parseArgs } from "node:util";
import { globSync } from "tinyglobby";

/**
 * Runs every Vitest test file a change adds or edits several times at once,
 * with retries disabled, and fails if any run fails.
 *
 * The runs are separate Vitest processes started together, so the files also
 * run under CPU and port contention. A test that fails only a few percent of
 * the time usually passes a single CI run; this catches it before it lands.
 */

const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/;
const VITEST_CONFIG_NAMES = [
	"vitest.config.ts",
	"vitest.config.mts",
	"vitest.config.cts",
	"vitest.config.js",
	"vitest.config.mjs",
	"vitest.config.cjs",
];

/** Test files that one Vitest config runs, in one workspace package. */
export interface TestGroup {
	/** Repository-relative directory of the package that owns the files. */
	packageDir: string;
	/** Package name, used to build the package and its dependencies. */
	packageName: string;
	/** Repository-relative path of the Vitest config that runs the files. */
	config: string;
	/** Repository-relative test file paths. */
	files: string[];
}

export interface Skipped {
	file: string;
	reason: string;
}

/**
 * Pick the test files to repeat from the paths a change adds or edits.
 * End-to-end tests are left out: they run in their own workflows and need
 * credentials this job does not have.
 */
export function selectTestFiles(changed: string[]): string[] {
	return changed
		.map((file) => file.replaceAll("\\", "/"))
		.filter((file) => TEST_FILE.test(file))
		.filter((file) => !file.split("/").includes("e2e"))
		.sort();
}

/**
 * Group test files by the workspace package and Vitest config that run them.
 *
 * The config is the closest default-named `vitest.config.*` between the file
 * and its package root. Files outside a workspace package, such as the test
 * files in project templates, are skipped, as are files with no config.
 */
export function groupTestFiles(
	files: string[],
	workspace: Map<string, string>,
	exists: (file: string) => boolean
): { groups: TestGroup[]; skipped: Skipped[] } {
	const groups = new Map<string, TestGroup>();
	const skipped: Skipped[] = [];
	for (const file of files) {
		const packageDir = closestAncestor(file, (dir) =>
			exists(path.posix.join(dir, "package.json"))
		);
		const packageName =
			packageDir === undefined ? undefined : workspace.get(packageDir);
		if (packageDir === undefined || packageName === undefined) {
			skipped.push({ file, reason: "not in a workspace package" });
			continue;
		}
		let config: string | undefined;
		closestAncestor(file, (dir) => {
			config = VITEST_CONFIG_NAMES.map((name) =>
				path.posix.join(dir, name)
			).find(exists);
			return config !== undefined || dir === packageDir;
		});
		if (config === undefined) {
			skipped.push({ file, reason: `no Vitest config in ${packageDir}` });
			continue;
		}
		let group = groups.get(config);
		if (group === undefined) {
			group = { packageDir, packageName, config, files: [] };
			groups.set(config, group);
		}
		group.files.push(file);
	}
	return { groups: [...groups.values()], skipped };
}

/** Return the closest directory above `file` that matches, stopping at the root. */
function closestAncestor(
	file: string,
	matches: (dir: string) => boolean
): string | undefined {
	let dir = path.posix.dirname(file);
	while (true) {
		if (matches(dir)) {
			return dir;
		}
		if (dir === ".") {
			return undefined;
		}
		dir = path.posix.dirname(dir);
	}
}

/** Map each workspace package directory to its package name. */
function readWorkspace(root: string): Map<string, string> {
	const manifest = readFileSync(path.join(root, "pnpm-workspace.yaml"), "utf8");
	const section = /^packages:\r?\n((?:[ \t]+-.*\n)+)/m.exec(manifest);
	assert(section, "Expected a packages list in pnpm-workspace.yaml");
	const patterns = Array.from(
		section[1].matchAll(/-\s*["']?([^"'\n]+)["']?/g),
		(match) => `${match[1].trim()}/package.json`
	);
	const workspace = new Map<string, string>();
	for (const manifestPath of globSync(patterns, {
		cwd: root,
		ignore: ["**/node_modules/**"],
	})) {
		const { name } = JSON.parse(
			readFileSync(path.join(root, manifestPath), "utf8")
		) as { name?: string };
		if (name !== undefined) {
			workspace.set(path.posix.dirname(manifestPath), name);
		}
	}
	return workspace;
}

/** List the files that differ between `base` and `HEAD`, excluding deletions. */
function changedFiles(root: string, base: string): string[] {
	const result = spawnSync(
		"git",
		["diff", "--name-only", "--diff-filter=AMR", base, "HEAD"],
		{ cwd: root, encoding: "utf8" }
	);
	if (result.status !== 0) {
		throw new Error(`git diff against ${base} failed: ${result.stderr}`);
	}
	return result.stdout.split("\n").filter(Boolean);
}

/** Express a repository-relative file as a Vitest filter for `cwd`. */
function relativeFilter(root: string, cwd: string, file: string): string {
	return path.relative(cwd, path.join(root, file)).replaceAll("\\", "/");
}

/** Run a Node.js entry point and fail if it does. */
function runNode(args: string[], cwd: string) {
	const result = spawnSync(process.execPath, args, { cwd, stdio: "inherit" });
	if (result.error) {
		throw result.error;
	}
	if (result.status !== 0) {
		throw new Error(`${args.join(" ")} exited with ${result.status}`);
	}
}

interface RunResult {
	run: number;
	exitCode: number;
	log: string;
	/** Test file (repository-relative) to its failed test names; empty if it passed. */
	files: Map<string, string[]>;
}

interface VitestJsonReport {
	testResults: {
		name: string;
		status: string;
		assertionResults: { fullName: string; status: string }[];
	}[];
}

/** Start one Vitest run of `files` and collect its per-file results. */
function runVitest(
	root: string,
	vitest: string,
	group: TestGroup,
	files: string[],
	run: number,
	outDir: string
): Promise<RunResult> {
	const cwd = path.join(root, path.posix.dirname(group.config));
	const report = path.join(outDir, `run-${run}.json`);
	const logPath = path.join(outDir, `run-${run}.log`);
	// Keep the saved logs plain text. Vitest colours output whenever FORCE_COLOR is set.
	const env: NodeJS.ProcessEnv = { ...process.env, NO_COLOR: "1" };
	delete env.FORCE_COLOR;
	// Run complete files on every attempt instead of the CI partition's shard.
	delete env.CI_TEST_SHARD;
	const child = spawn(
		process.execPath,
		[
			vitest,
			"run",
			`--config=${path.basename(group.config)}`,
			"--retry=0",
			"--reporter=default",
			"--reporter=json",
			`--outputFile=${report}`,
			...files.map((file) => relativeFilter(root, cwd, file)),
		],
		{ cwd, env, stdio: ["ignore", "pipe", "pipe"] }
	);
	const chunks: Buffer[] = [];
	child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
	child.stderr.on("data", (chunk: Buffer) => chunks.push(chunk));
	return new Promise((resolve, reject) => {
		child.on("error", reject);
		child.on("close", (code, signal) => {
			const log = Buffer.concat(chunks).toString("utf8");
			writeFileSync(logPath, log);
			const results = new Map<string, string[]>();
			if (existsSync(report)) {
				const json = JSON.parse(
					readFileSync(report, "utf8")
				) as VitestJsonReport;
				for (const result of json.testResults) {
					const file = path.relative(root, result.name).replaceAll("\\", "/");
					const failed = result.assertionResults
						.filter(({ status }) => status === "failed")
						.map(({ fullName }) => fullName);
					if (result.status !== "passed" && failed.length === 0) {
						failed.push(`(file ${result.status})`);
					}
					results.set(file, failed);
				}
			}
			resolve({
				run,
				exitCode: code ?? (signal ? 1 : 0),
				log,
				files: results,
			});
		});
	});
}

/** Print each run's output, keeping passing runs collapsed in GitHub's log. */
function printRuns(group: TestGroup, runs: RunResult[]) {
	// eslint-disable-next-line turbo/no-undeclared-env-vars -- GitHub Actions sets this; it only changes how logs are grouped
	const github = process.env.GITHUB_ACTIONS === "true";
	for (const run of runs) {
		const outcome = run.exitCode === 0 ? "passed" : "failed";
		const title = `${group.config}: run ${run.run}/${runs.length} ${outcome}`;
		if (github && run.exitCode === 0) {
			console.log(`::group::${title}\n${run.log}\n::endgroup::`);
		} else {
			console.log(`\n===== ${title} =====\n${run.log}`);
		}
	}
}

/** Summarise each file's outcome across runs, and report failures. */
function summarise(group: TestGroup, files: string[], runs: RunResult[]) {
	let failed = false;
	const rows: string[] = [];
	for (const file of files) {
		const failures = new Set<string>();
		let passes = 0;
		for (const run of runs) {
			const result = run.files.get(file);
			if (result === undefined) {
				failures.add(`(no result in run ${run.run})`);
			} else if (result.length === 0) {
				passes++;
			} else {
				result.forEach((test) => failures.add(test));
			}
		}
		if (passes < runs.length) {
			failed = true;
			console.log(
				`::error file=${file}::Passed ${passes} of ${runs.length} runs. Failed: ${[...failures].join("; ")}`
			);
		}
		const failedTests = [...failures].map((test) => `\`${test}\``).join(", ");
		rows.push(
			`| \`${file}\` | ${passes}/${runs.length} | ${failedTests || "-"} |`
		);
	}
	// A run can also fail outside any test, for example on an unhandled error.
	for (const { run, exitCode, files: results } of runs) {
		const testsPassed = files.every((file) => results.get(file)?.length === 0);
		if (exitCode !== 0 && testsPassed) {
			failed = true;
			console.log(
				`::error file=${group.config}::Run ${run}/${runs.length} exited with code ${exitCode} although its tests passed`
			);
		}
	}
	return { failed, rows };
}

function writeSummary(markdown: string) {
	console.log(markdown);
	// eslint-disable-next-line turbo/no-undeclared-env-vars -- GitHub Actions provides the job summary path
	const summary = process.env.GITHUB_STEP_SUMMARY;
	if (summary) {
		appendFileSync(summary, `${markdown}\n`);
	}
}

async function main() {
	const { values } = parseArgs({
		options: {
			base: { type: "string", default: "HEAD^1" },
			runs: { type: "string", default: "5" },
			"out-dir": { type: "string", default: ".turbo/repeat-tests" },
		},
	});
	const runCount = Number(values.runs);
	assert(Number.isSafeInteger(runCount) && runCount > 0, "Invalid --runs");
	const root = path.resolve(__dirname, "../..");
	const outRoot = path.resolve(root, values["out-dir"]);
	// eslint-disable-next-line workers-sdk/no-direct-recursive-rm -- clear an earlier local run's logs without depending on a workspace build
	rmSync(outRoot, { recursive: true, force: true, maxRetries: 3 });

	const files = selectTestFiles(changedFiles(root, values.base));
	const { groups, skipped } = groupTestFiles(
		files,
		readWorkspace(root),
		(file) => existsSync(path.join(root, file))
	);
	const lines = [`## Changed test files, ${runCount} runs each`];
	for (const { file, reason } of skipped) {
		lines.push(`- Skipped \`${file}\`: ${reason}.`);
	}
	if (groups.length === 0) {
		writeSummary([...lines, "", "No Vitest test files changed."].join("\n"));
		return;
	}

	// Build the packages under test, and their dependencies, as `test:ci` does.
	runNode(
		[
			require.resolve("turbo/bin/turbo"),
			"run",
			"build",
			...groups.map(({ packageName }) => `--filter=${packageName}`),
		],
		root
	);

	let failed = false;
	const rows = [
		"| File | Passing runs | Failed tests |",
		"| ---- | ------------ | ------------ |",
	];
	for (const [index, group] of groups.entries()) {
		const cwd = path.join(root, path.posix.dirname(group.config));
		const vitest = path.join(
			path.dirname(
				createRequire(path.join(cwd, "package.json")).resolve(
					"vitest/package.json"
				)
			),
			"vitest.mjs"
		);
		const outDir = path.join(outRoot, String(index));
		mkdirSync(outDir, { recursive: true });

		// Vitest filters are substrings; keep only files the config really runs.
		const listPath = path.join(outDir, "list.json");
		runNode(
			[
				vitest,
				"list",
				"--filesOnly",
				`--json=${listPath}`,
				`--config=${path.basename(group.config)}`,
				...group.files.map((file) => relativeFilter(root, cwd, file)),
			],
			cwd
		);
		const listed = new Set(
			(JSON.parse(readFileSync(listPath, "utf8")) as { file: string }[]).map(
				({ file }) => path.relative(root, file).replaceAll("\\", "/")
			)
		);
		const included = group.files.filter((file) => listed.has(file));
		for (const unlisted of group.files.filter((file) => !listed.has(file))) {
			lines.push(`- Skipped \`${unlisted}\`: not run by \`${group.config}\`.`);
		}
		if (included.length === 0) {
			continue;
		}

		console.log(
			`Running ${included.length} file(s) with ${group.config}, ${runCount} runs at once:\n${included.join("\n")}`
		);
		const runs = await Promise.all(
			Array.from({ length: runCount }, (_, run) =>
				runVitest(root, vitest, group, included, run + 1, outDir)
			)
		);
		printRuns(group, runs);
		const result = summarise(group, included, runs);
		failed ||= result.failed;
		rows.push(...result.rows);
	}

	if (rows.length === 2) {
		rows.push(
			"| No changed test file is run by its package's Vitest config. | | |"
		);
	}
	writeSummary([...lines, "", ...rows].join("\n"));
	if (failed) {
		process.exitCode = 1;
	}
}

if (require.main === module) {
	main().catch((error) => {
		console.error(error);
		process.exit(1);
	});
}
