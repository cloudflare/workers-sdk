import { existsSync, mkdtempSync, realpathSync, rmSync } from "fs";
import crypto from "node:crypto";
import { tmpdir } from "os";
import { join } from "path";
import { spawn } from "cross-spawn";
import { sleep } from "helpers/common";
import { spinnerFrames } from "helpers/interactive";
import { detectPackageManager } from "helpers/packages";
import { fetch } from "undici";
import { expect } from "vitest";
import { version } from "../package.json";
import type { SpinnerStyle } from "helpers/interactive";

export const C3_E2E_PREFIX = "c3-e2e-";

export const keys = {
	enter: "\x0d",
	backspace: "\x7f",
	escape: "\x1b",
	up: "\x1b\x5b\x41",
	down: "\x1b\x5b\x42",
	right: "\x1b\x5b\x43",
	left: "\x1b\x5b\x44",
};

export type PromptHandler = {
	matcher: RegExp;
	input: string[];
};

export type RunnerConfig = {
	overrides?: {
		packageScripts?: Record<string, string>;
	};
	promptHandlers?: PromptHandler[];
	argv?: string[];
	outputPrefix?: string;
	quarantine?: boolean;
};

export const runC3 = async ({
	argv = [],
	promptHandlers = [],
	outputPrefix = "",
}: RunnerConfig) => {
	const cmd = "node";
	const args = ["./dist/cli.js", ...argv];
	const proc = spawn(cmd, args);

	promptHandlers = [...promptHandlers];

	const { name: pm } = detectPackageManager();

	console.log(
		`\x1b[44m${outputPrefix} Running C3 with command: \`${cmd} ${args.join(
			" "
		)}\` (using ${pm})\x1b[0m`
	);

	const stdout: string[] = [];
	const stderr: string[] = [];

	promptHandlers = promptHandlers && [...promptHandlers];

	await new Promise((resolve, rejects) => {
		proc.stdout.on("data", (data) => {
			const lines: string[] = data.toString().split("\n");
			const currentDialog = promptHandlers[0];

			lines.forEach(async (line) => {
				if (filterLine(line)) {
					console.log(`${outputPrefix} ${line}`);
				}
				stdout.push(line);

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
		});

		proc.stderr.on("data", (data) => {
			stderr.push(data);
		});

		proc.on("close", (code) => {
			if (code === 0) {
				resolve(null);
			} else {
				console.log(stderr.join("\n").trim());
				rejects(code);
			}
		});

		proc.on("error", (exitCode) => {
			rejects({
				exitCode,
				output: condenseOutput(stdout).join("\n").trim(),
				errors: stderr.join("\n").trim(),
			});
		});
	});

	return {
		output: condenseOutput(stdout).join("\n").trim(),
		errors: stderr.join("\n").trim(),
	};
};

export const testProjectDir = (suite: string) => {
	const tmpDirPath = realpathSync(
		mkdtempSync(join(tmpdir(), `c3-tests-${suite}`))
	);

	const randomSuffix = crypto.randomBytes(4).toString("hex");
	const baseProjectName = `${C3_E2E_PREFIX}${randomSuffix}`;

	const getName = (suffix: string) => `${baseProjectName}-${suffix}`;
	const getPath = (suffix: string) => join(tmpDirPath, getName(suffix));
	const clean = (suffix: string) => {
		const path = getPath(suffix);
		if (existsSync(path)) {
			rmSync(path, {
				recursive: true,
				force: true,
			});
		}
	};

	return { getName, getPath, clean };
};

export const testDeploymentCommitMessage = async (
	projectName: string,
	framework: string
) => {
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

	const projectLatestCommitMessage = result.find(
		(project) => project.name === projectName
	)?.latest_deployment?.deployment_trigger?.metadata?.commit_message;
	expect(projectLatestCommitMessage).toMatch(
		/^Initialize web application via create-cloudflare CLI/
	);
	expect(projectLatestCommitMessage).toContain(
		`C3 = create-cloudflare@${version}`
	);
	expect(projectLatestCommitMessage).toContain(`project name = ${projectName}`);
	expect(projectLatestCommitMessage).toContain(`framework = ${framework}`);
};

// Removes lines from the output of c3 that aren't particularly useful for debugging tests
export const condenseOutput = (lines: string[]) => {
	return lines.filter(filterLine);
};

const filterLine = (line: string) => {
	// Remove all lines with spinners
	for (const spinnerType of Object.keys(spinnerFrames)) {
		for (const frame of spinnerFrames[spinnerType as SpinnerStyle]) {
			if (line.includes(frame)) return false;
		}
	}

	// Remove empty lines
	if (line.replace(/\s/g, "").length == 0) return false;

	return true;
};

export const isQuarantineMode = () => {
	return process.env.E2E_QUARANTINE === "true";
};
