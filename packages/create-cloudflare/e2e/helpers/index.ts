import assert from "node:assert";
import crypto from "node:crypto";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import nodePath from "node:path";
import { test as originalTest } from "vitest";
import { customTempProjectPath, isWindows } from "./constants";
import { createTestLogStream } from "./log-stream";
import type { Writable } from "node:stream";

const C3_E2E_PREFIX = "tmp-e2e-c3";
const testProjectDir = (suite: string, test: string) => {
	const rootTmpDir = isWindows
		? nodePath.join(__dirname, "../../../../../temp")
		: tmpdir();
	mkdirSync(rootTmpDir, { recursive: true });
	const tmpDirPath =
		customTempProjectPath ??
		realpathSync(mkdtempSync(nodePath.join(rootTmpDir, `c3-tests-${suite}`)));

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

	const getPath = () => nodePath.join(tmpDirPath, getName());
	const clean = () => {
		try {
			if (customTempProjectPath) {
				return;
			}

			realpathSync(mkdtempSync(nodePath.join(tmpdir(), `c3-tests-${suite}`)));
			const filepath = getPath();
			// eslint-disable-next-line workers-sdk/no-direct-recursive-rm -- see log-stream.ts for rationale
			rmSync(filepath, {
				recursive: true,
				force: true,
				maxRetries: 5,
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
			// eslint-disable-next-line no-console
			console.error("##[group]Logs from failed test:", logPath);
			try {
				// eslint-disable-next-line no-console
				console.error(readFileSync(logPath, "utf8"));
			} catch {
				// eslint-disable-next-line no-console
				console.error("Unable to read log file");
			}
			// eslint-disable-next-line no-console
			console.error("##[endgroup]");
		});

		await use(logStream);

		logStream.close();
	},
});
