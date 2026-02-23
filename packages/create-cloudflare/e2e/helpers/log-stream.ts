import assert from "node:assert";
import { createWriteStream, mkdirSync, rmSync } from "node:fs";
import nodePath from "node:path";
import { isExperimental, testPackageManager } from "./constants";
import type { RunnerTask, RunnerTestSuite } from "vitest";

export function createTestLogStream(task: RunnerTask) {
	// The .ansi extension allows for editor extensions that format ansi terminal codes
	const fileName = `${normalizeTestName(task)}.ansi`;
	assert(task.suite, "Expected task.suite to be defined");
	const logPath = nodePath.join(getLogPath(task.suite), fileName);
	const logStream = createWriteStream(logPath, {
		flags: "a",
	});
	return {
		logPath,
		logStream,
	};
}

export function recreateLogFolder(suite: RunnerTestSuite) {
	// Clean the old folder if exists (useful for dev)
	//
	// Note: this is intentionally inlined rather than importing `removeDirSync`
	// from `@cloudflare/workers-utils`. That package's barrel export pulls in CJS
	// dependencies (e.g. `xdg-app-paths`) that break when Vite bundles the vitest
	// config (which imports this file) into ESM — the shimmed `require()` calls
	// throw "Dynamic require of 'path' is not supported".
	// Keep aligned with `removeDirSync()` in `packages/workers-utils/src/fs-helpers.ts`.
	// eslint-disable-next-line workers-sdk/no-direct-recursive-rm
	rmSync(getLogPath(suite), {
		recursive: true,
		force: true,
		maxRetries: 5,
		retryDelay: 100,
	});

	mkdirSync(getLogPath(suite), { recursive: true });
}

function normalizeTestName(task: RunnerTask) {
	const baseName = task.name
		.toLowerCase()
		.replace(/\s+/g, "_") // replace any whitespace with `_`
		.replace(/\W/g, ""); // strip special characters

	// Ensure that each retry gets its own log file
	const retryCount = task.result?.retryCount ?? 0;
	const suffix = retryCount > 0 ? `_${retryCount}` : "";
	return baseName + suffix;
}

function getLogPath(suite: RunnerTestSuite) {
	const { file } = suite;

	const suiteFilename = file
		? nodePath.basename(file.name).replace(".test.ts", "")
		: "unknown";

	return nodePath.join(
		getLogFolder(isExperimental, testPackageManager),
		suiteFilename,
	);
}

export function getLogFolder(experimental: boolean, packageManager: string) {
	return nodePath.join(
		"./.e2e-logs" + (experimental ? "-experimental" : ""),
		packageManager,
	);
}
