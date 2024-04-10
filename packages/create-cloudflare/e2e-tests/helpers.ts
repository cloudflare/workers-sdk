import {
	createWriteStream,
	mkdirSync,
	mkdtempSync,
	realpathSync,
	rmSync,
} from "fs";
import crypto from "node:crypto";
import { tmpdir } from "os";
import { basename, join } from "path";
import { stripAnsi } from "@cloudflare/cli";
import { spawn } from "cross-spawn";
import { retry } from "helpers/retry";
import { sleep } from "helpers/sleep";
import { fetch } from "undici";
import { expect } from "vitest";
import { version } from "../package.json";
import type {
	ChildProcessWithoutNullStreams,
	SpawnOptionsWithoutStdio,
} from "child_process";
import type { WriteStream } from "fs";
import type { Suite, TaskContext } from "vitest";

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
	input: string[];
};

export type RunnerConfig = {
	promptHandlers?: PromptHandler[];
	argv?: string[];
	quarantine?: boolean;
	timeout?: number;
	verifyDeploy?: {
		route: string;
		expectedText: string;
	};
};

export const runC3 = async (
	argv: string[] = [],
	promptHandlers: PromptHandler[] = [],
	logStream: WriteStream
) => {
	const cmd = ["node", "./dist/cli.js", ...argv];
	const proc = spawnWithLogging(cmd, { env: testEnv }, logStream);

	// Clone the prompt handlers so we can consume them destructively
	promptHandlers = promptHandlers && [...promptHandlers];

	const onData = (data: string) => {
		const lines: string[] = data.toString().split("\n");
		const currentDialog = promptHandlers[0];

		lines.forEach(async (line) => {
			if (currentDialog && currentDialog.matcher.test(line)) {
				// Add a small sleep to avoid input race
				await sleep(1000);

				currentDialog.input.forEach((keystroke) => {
					proc.stdin.write(keystroke);
				});

				// Consume the handler once we've used it
				promptHandlers.shift();

				// If we've consumed the last prompt handler, close the input stream
				// Otherwise, the process wont exit properly
				if (promptHandlers[0] === undefined) {
					proc.stdin.end();
				}
			}
		});
	};

	return waitForExit(proc, onData);
};

/**
 * Spawn a child process and attach a handler that will log any output from
 * `stdout` or errors from `stderror` to a dedicated log file.
 *
 * @param args The command and arguments as an array
 * @param opts Additional options to be passed to the `spawn` call
 * @param logStream A write stream to the log file for the test
 * @returns the child process that was created
 */
export const spawnWithLogging = (
	args: string[],
	opts: SpawnOptionsWithoutStdio,
	logStream: WriteStream
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
	onData?: (chunk: string) => void
) => {
	const stdout: string[] = [];
	const stderr: string[] = [];

	await new Promise((resolve, rejects) => {
		proc.stdout.on("data", (data) => {
			stdout.push(data);
			if (onData) {
				onData(data);
			}
		});

		proc.stderr.on("data", (data) => {
			stderr.push(data);
		});

		proc.on("close", (code) => {
			if (code === 0) {
				resolve(null);
			} else {
				rejects(code);
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

export const createTestLogStream = (ctx: TaskContext) => {
	// The .ansi extension allows for editor extensions that format ansi terminal codes
	const fileName = `${normalizeTestName(ctx)}.ansi`;
	return createWriteStream(join(getLogPath(ctx.task.suite), fileName), {
		flags: "a",
	});
};

export const recreateLogFolder = (suite: Suite) => {
	// Clean the old folder if exists (useful for dev)
	rmSync(getLogPath(suite), {
		recursive: true,
		force: true,
	});

	mkdirSync(getLogPath(suite), { recursive: true });
};

const getLogPath = (suite: Suite) => {
	const { file } = suite;

	const suiteFilename = file
		? basename(file.name).replace(".test.ts", "")
		: "unknown";

	return join("./.e2e-logs/", process.env.TEST_PM as string, suiteFilename);
};

const normalizeTestName = (ctx: TaskContext) => {
	const baseName = ctx.task.name
		.toLowerCase()
		.replace(/\s+/g, "_") // replace any whitespace with `_`
		.replace(/\W/g, ""); // strip special characters

	// Ensure that each retry gets its own log file
	const retryCount = ctx.task.result?.retryCount ?? 0;
	const suffix = retryCount > 0 ? `_${retryCount}` : "";
	return baseName + suffix;
};

export const testProjectDir = (suite: string) => {
	const tmpDirPath =
		process.env.E2E_PROJECT_PATH ??
		realpathSync(mkdtempSync(join(tmpdir(), `c3-tests-${suite}`)));

	const randomSuffix = crypto.randomBytes(4).toString("hex");
	const baseProjectName = `${C3_E2E_PREFIX}${randomSuffix}`;

	const getName = (suffix: string) => `${baseProjectName}-${suffix}`;
	const getPath = (suffix: string) => join(tmpDirPath, getName(suffix));
	const clean = (suffix: string) => {
		try {
			if (process.env.E2E_PROJECT_PATH) {
				return;
			}

			realpathSync(mkdtempSync(join(tmpdir(), `c3-tests-${suite}`)));
			const path = getPath(suffix);
			rmSync(path, {
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
	framework: string
) => {
	const projectLatestCommitMessage = await retry({ times: 5 }, async () => {
		// Wait for 2 seconds between each attempt
		await new Promise((resolve) => setTimeout(resolve, 2000));
		// Note: we cannot simply run git and check the result since the commit can be part of the
		//       deployment even without git, so instead we fetch the deployment info from the pages api
		const response = await fetch(
			`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/pages/projects`,
			{
				headers: {
					Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
				},
			}
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
		/Initialize web application via create-cloudflare CLI/
	);
	expect(projectLatestCommitMessage).toContain(
		`C3 = create-cloudflare@${version}`
	);
	expect(projectLatestCommitMessage).toContain(`project name = ${projectName}`);
	expect(projectLatestCommitMessage).toContain(`framework = ${framework}`);
};

export const isQuarantineMode = () => {
	return process.env.E2E_QUARANTINE === "true";
};
