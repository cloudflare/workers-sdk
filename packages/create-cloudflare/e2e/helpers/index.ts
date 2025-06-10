import assert from "node:assert";
import crypto from "node:crypto";
import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test as originalTest } from "vitest";
import { customTempProjectPath } from "./constants";
import { createTestLogStream } from "./log-stream";
import type { Writable } from "node:stream";

const C3_E2E_PREFIX = "tmp-e2e-c3";
const testProjectDir = (suite: string, test: string) => {
	const tmpDirPath =
		customTempProjectPath ??
		realpathSync(mkdtempSync(path.join(tmpdir(), `c3-tests-${suite}`)));

	const randomSuffix = crypto.randomBytes(4).toString("hex");
	const baseProjectName = `${C3_E2E_PREFIX}${randomSuffix}`;

	const getName = () => {
		// Worker project names cannot be longer than 58 characters
		const projectName = `${baseProjectName}-${test.substring(0, 57 - baseProjectName.length)}`;

		// Project name cannot start/end with a dash
		if (projectName.endsWith("-")) {
			return projectName.slice(0, -1);
		}

		return projectName;
	};

	const getPath = () => path.join(tmpDirPath, getName());
	const clean = () => {
		try {
			if (customTempProjectPath) {
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

/**
 * A custom Vitest `test` that is extended to provide a project path and name, and a logStream.
 */
export const test = originalTest.extend<{
	project: { path: string; name: string };
	logStream: Writable;
}>({
	async project({ task }, use) {
		assert(task.suite, "Expected task.suite to be defined");
		const suite = task.suite.name.toLowerCase().replaceAll(/[^a-z0-9-]/g, "-");
		const suffix = task.name
			.toLowerCase()
			.replaceAll(/[^a-z0-9-]/g, "-")
			.replaceAll(/^-|-$/g, "");
		const { getPath, getName, clean } = testProjectDir(suite, suffix);
		await use({ path: getPath(), name: getName() });
		clean();
	},
	async logStream({ task, onTestFailed }, use) {
		const { logPath, logStream } = createTestLogStream(task);

		onTestFailed(() => {
			console.error("##[group]Logs from failed test:", logPath);
			try {
				console.error(readFileSync(logPath, "utf8"));
			} catch {
				console.error("Unable to read log file");
			}
			console.error("##[endgroup]");
		});

		await use(logStream);

		logStream.close();
	},
});
