import assert from "assert";
import {
	createWriteStream,
	mkdirSync,
	mkdtempSync,
	realpathSync,
	rmSync,
} from "fs";
import crypto from "node:crypto";
import { tmpdir } from "os";
import path from "path";
import { setTimeout } from "timers/promises";
import { stripAnsi } from "@cloudflare/cli";
import { spawn } from "cross-spawn";
import { retry } from "helpers/retry";
import treeKill from "tree-kill";
import { fetch } from "undici";
import { expect, test as originalTest } from "vitest";
import { version } from "../package.json";
import type {
	ChildProcess,
	ChildProcessWithoutNullStreams,
	SpawnOptionsWithoutStdio,
} from "child_process";
import type { Writable } from "stream";
import type { RunnerTestCase, Suite, Test } from "vitest";

export const C3_E2E_PREFIX = "tmp-e2e-c3";

export const keys = {
	enter: "\x0d",
	backspace: "\x7f",
	escape: "\x1b",
	up: "\x1b\x5b\x41",
	down: "\x1b\x5b\x42",
	right: "\x1b\x5b\x43",
	left: "\x1b\x5b\x44",
};

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

export type PromptHandler = {
	matcher: RegExp;
	input:
		| string[]
		| {
				type: "select";
				target: RegExp | string;
				assertDefaultSelection?: string;
				assertDescriptionText?: string;
		  };
};

export type RunnerConfig = {
	promptHandlers?: PromptHandler[];
	argv?: string[];
	quarantine?: boolean;
	timeout?: number;
	verifyDeploy: null | {
		route: string;
		expectedText: string;
	};
	verifyPreview: null | {
		route: string;
		expectedText: string;
	};
};

export const runC3 = async (
	argv: string[] = [],
	promptHandlers: PromptHandler[] = [],
	logStream: Writable,
) => {
	const cmd = ["node", "./dist/cli.js", ...argv];
	const proc = spawnWithLogging(cmd, { env: testEnv }, logStream);

	const onData = (data: string) => {
		handlePrompt(data);
	};

	// Clone the prompt handlers so we can consume them destructively
	promptHandlers = [...promptHandlers];

	// When changing selection, stdout updates but onData may not include the question itself
	// so we store the current PromptHandler if we have already matched the question
	let currentSelectDialog: PromptHandler | undefined;
	const handlePrompt = (data: string) => {
		const text = stripAnsi(data.toString());
		const lines = text.split("\n");
		const currentDialog = currentSelectDialog ?? promptHandlers[0];

		if (!currentDialog) {
			return;
		}

		const matchesPrompt = lines.some((line) =>
			currentDialog.matcher.test(line),
		);

		// if we don't match the current question and we haven't already matched it previously
		if (!matchesPrompt && !currentSelectDialog) {
			return;
		}

		if (Array.isArray(currentDialog.input)) {
			// keyboard input prompt handler
			currentDialog.input.forEach((keystroke) => {
				proc.stdin.write(keystroke);
			});
		} else if (currentDialog.input.type === "select") {
			// select prompt handler

			// FirstFrame: The first onData call for the current select dialog
			const isFirstFrameOfCurrentSelectDialog =
				currentSelectDialog === undefined;

			// Our select prompt options start with ○ / ◁ for unselected options and ● / ◀ for the current selection
			const selectedOptionRegex = /^(●|◀)\s/;
			const currentSelection = lines
				.find((line) => line.match(selectedOptionRegex))
				?.replace(selectedOptionRegex, "");

			if (!currentSelection) {
				// sometimes `lines` contain only the 'clear screen' ANSI codes and not the prompt options
				return;
			}

			const { target, assertDefaultSelection, assertDescriptionText } =
				currentDialog.input;

			if (
				isFirstFrameOfCurrentSelectDialog &&
				assertDefaultSelection !== undefined &&
				assertDefaultSelection !== currentSelection
			) {
				throw new Error(
					`The default selection does not match; Expected "${assertDefaultSelection}" but found "${currentSelection}".`,
				);
			}

			const matchesSelectionTarget =
				typeof target === "string"
					? currentSelection.includes(target)
					: target.test(currentSelection);
			const description = text.replaceAll("\n", " ");

			if (
				matchesSelectionTarget &&
				assertDescriptionText !== undefined &&
				!description.includes(assertDescriptionText)
			) {
				throw new Error(
					`The description does not match; Expected "${assertDescriptionText}" but found "${description}".`,
				);
			}

			if (matchesSelectionTarget) {
				// matches selection, so hit enter
				proc.stdin.write(keys.enter);
				currentSelectDialog = undefined;
			} else {
				// target not selected, hit down and wait for stdout to update (onData will be called again)
				proc.stdin.write(keys.down);
				currentSelectDialog = currentDialog;
				return;
			}
		}

		// Consume the handler once we've used it
		promptHandlers.shift();

		// If we've consumed the last prompt handler, close the input stream
		// Otherwise, the process wont exit properly
		if (promptHandlers[0] === undefined) {
			proc.stdin.end();
		}
	};

	return waitForExit(proc, onData);
};

/**
 * Spawn a child process and attach a handler that will log any output from
 * `stdout` or errors from `stderr` to a dedicated log file.
 *
 * @param args The command and arguments as an array
 * @param opts Additional options to be passed to the `spawn` call
 * @param logStream A write stream to the log file for the test
 * @returns the child process that was created
 */
export const spawnWithLogging = (
	args: string[],
	opts: SpawnOptionsWithoutStdio,
	logStream: Writable,
) => {
	const [cmd, ...argv] = args;

	logStream.write(`\nRunning command: ${[cmd, ...argv].join(" ")}\n\n`);

	const proc = spawn(cmd, argv, {
		...opts,
		env: {
			...testEnv,
			...opts.env,
		},
	});

	proc.stdout.on("data", (data) => {
		const lines: string[] = data.toString().split("\n");

		lines.forEach(async (line) => {
			const stripped = stripAnsi(line).trim();
			if (stripped.length > 0) {
				logStream.write(`${stripped}\n`);
			}
		});
	});

	proc.stderr.on("data", (data) => {
		logStream.write(data);
	});

	return proc;
};

/**
 * An async function that waits on a spawned process to run to completion, collecting
 * any output or errors from `stdout` and `stderr`, respectively.
 *
 * @param proc The child process to wait for
 * @param onData An optional handler to be called on `stdout.on('data')`
 */
export const waitForExit = async (
	proc: ChildProcessWithoutNullStreams,
	onData?: (chunk: string) => void,
) => {
	const stdout: string[] = [];
	const stderr: string[] = [];

	await new Promise((resolve, rejects) => {
		proc.stdout.on("data", (data) => {
			stdout.push(data);
			try {
				if (onData) {
					onData(data);
				}
			} catch (error) {
				// Close the input stream so the process can exit properly
				proc.stdin.end();
				throw error;
			}
		});

		proc.stderr.on("data", (data) => {
			stderr.push(data);
		});

		proc.on("close", (code) => {
			if (code === 0) {
				resolve(null);
			} else {
				rejects({
					code,
					output: stdout.join("\n").trim(),
					errors: stderr.join("\n").trim(),
				});
			}
		});

		proc.on("error", (exitCode) => {
			rejects({
				exitCode,
				output: stdout.join("\n").trim(),
				errors: stderr.join("\n").trim(),
			});
		});
	});

	return {
		output: stdout.join("\n").trim(),
		errors: stderr.join("\n").trim(),
	};
};

export const createTestLogStream = (
	opts: { experimental: boolean },
	task: RunnerTestCase,
) => {
	// The .ansi extension allows for editor extensions that format ansi terminal codes
	const fileName = `${normalizeTestName(task)}.ansi`;
	assert(task.suite, "Expected task.suite to be defined");
	return createWriteStream(path.join(getLogPath(opts, task.suite), fileName), {
		flags: "a",
	});
};

export const recreateDiffsFolder = (opts: { experimental: boolean }) => {
	// Recreate the diffs folder
	const diffsPath = getDiffsPath(opts);
	rmSync(diffsPath, {
		recursive: true,
		force: true,
	});
	mkdirSync(diffsPath, { recursive: true });
};

export const getDiffsPath = (opts: { experimental: boolean }) => {
	return path.resolve(
		"./.e2e-diffs" + (opts.experimental ? "-experimental" : ""),
	);
};

export const recreateLogFolder = (
	opts: { experimental: boolean },
	suite: Suite,
) => {
	// Clean the old folder if exists (useful for dev)
	rmSync(getLogPath(opts, suite), {
		recursive: true,
		force: true,
	});

	mkdirSync(getLogPath(opts, suite), { recursive: true });
};

const getLogPath = (opts: { experimental: boolean }, suite: Suite) => {
	const { file } = suite;

	const suiteFilename = file
		? path.basename(file.name).replace(".test.ts", "")
		: "unknown";

	return path.join(
		"./.e2e-logs" + (opts.experimental ? "-experimental" : ""),
		process.env.TEST_PM as string,
		suiteFilename,
	);
};

const normalizeTestName = (task: Test) => {
	const baseName = task.name
		.toLowerCase()
		.replace(/\s+/g, "_") // replace any whitespace with `_`
		.replace(/\W/g, ""); // strip special characters

	// Ensure that each retry gets its own log file
	const retryCount = task.result?.retryCount ?? 0;
	const suffix = retryCount > 0 ? `_${retryCount}` : "";
	return baseName + suffix;
};

export const testProjectDir = (suite: string, test: string) => {
	const tmpDirPath =
		process.env.E2E_PROJECT_PATH ??
		realpathSync(mkdtempSync(path.join(tmpdir(), `c3-tests-${suite}`)));

	const randomSuffix = crypto.randomBytes(4).toString("hex");
	const baseProjectName = `${C3_E2E_PREFIX}${randomSuffix}`;

	const getName = () =>
		// Worker project names cannot be longer than 58 characters
		`${baseProjectName}-${test.substring(0, 57 - baseProjectName.length)}`;
	const getPath = () => path.join(tmpDirPath, getName());
	const clean = () => {
		try {
			if (process.env.E2E_PROJECT_PATH) {
				return;
			}

			realpathSync(mkdtempSync(path.join(tmpdir(), `c3-tests-${suite}`)));
			const filepath = getPath();
			rmSync(filepath, {
				recursive: true,
				force: true,
				maxRetries: 10,
				retryDelay: 100,
			});
		} catch (e) {
			if (typeof e === "object" && e !== null && "code" in e) {
				const code = e.code;
				if (code === "EBUSY" || code === "ENOENT" || code === "ENOTEMPTY") {
					return;
				}
			}
			throw e;
		}
	};

	return { getName, getPath, clean };
};

export const testDeploymentCommitMessage = async (
	projectName: string,
	framework: string,
) => {
	const projectLatestCommitMessage = await retry({ times: 5 }, async () => {
		// Wait for 2 seconds between each attempt
		await setTimeout(2000);
		// Note: we cannot simply run git and check the result since the commit can be part of the
		//       deployment even without git, so instead we fetch the deployment info from the pages api
		const response = await fetch(
			`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/pages/projects`,
			{
				headers: {
					Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
				},
			},
		);

		const result = (
			(await response.json()) as {
				result: {
					name: string;
					latest_deployment?: {
						deployment_trigger: {
							metadata?: {
								commit_message: string;
							};
						};
					};
				}[];
			}
		).result;

		const commitMessage = result.find((project) => project.name === projectName)
			?.latest_deployment?.deployment_trigger?.metadata?.commit_message;
		if (!commitMessage) {
			throw new Error("Could not find deployment with name " + projectName);
		}
		return commitMessage;
	});

	expect(projectLatestCommitMessage).toMatch(
		/Initialize web application via create-cloudflare CLI/,
	);
	expect(projectLatestCommitMessage).toContain(
		`C3 = create-cloudflare@${version}`,
	);
	expect(projectLatestCommitMessage).toContain(`project name = ${projectName}`);
	expect(projectLatestCommitMessage).toContain(`framework = ${framework}`);
};

export const isQuarantineMode = () => {
	return process.env.E2E_QUARANTINE === "true";
};

/**
 * A custom Vitest `test` that is extended to provide a project path and name, and a logStream.
 */
export const test = (opts: { experimental: boolean }) =>
	originalTest.extend<{
		project: { path: string; name: string };
		logStream: Writable;
	}>({
		async project({ task }, use) {
			assert(task.suite, "Expected task.suite to be defined");
			const suite = task.suite.name
				.toLowerCase()
				.replaceAll(/[^a-z0-9-]/g, "-");
			const suffix = task.name.toLowerCase().replaceAll(/[^a-z0-9-]/g, "-");
			const { getPath, getName, clean } = testProjectDir(suite, suffix);
			await use({ path: getPath(), name: getName() });
			clean();
		},
		async logStream({ task }, use) {
			const logStream = createTestLogStream(opts, task);
			await use(logStream);
			logStream.close();
		},
	});

export function kill(proc: ChildProcess) {
	return new Promise<void>(
		(resolve) => proc.pid && treeKill(proc.pid, "SIGINT", () => resolve()),
	);
}
