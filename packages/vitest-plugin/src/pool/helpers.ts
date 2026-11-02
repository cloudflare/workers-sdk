import crypto from "node:crypto";
import path from "node:path";
import type { TestProject } from "vitest/node";

// User worker names must not start with this
export const WORKER_NAME_PREFIX = "vitest-plugin-";

export function isFileNotFoundError(e: unknown): boolean {
	return (
		typeof e === "object" && e !== null && "code" in e && e.code === "ENOENT"
	);
}

export function getProjectPath(project: TestProject): string {
	return project.config.root;
}

export function getRelativeProjectPath(project: TestProject): string {
	const projectPath = getProjectPath(project);
	return path.relative("", projectPath);
}

export function getRelativeProjectConfigPath(project: TestProject): string {
	return project.config.config
		? path.relative("", project.config.config)
		: getRelativeProjectPath(project);
}

export function getRunnerName(project: TestProject, testFile?: string) {
	const name = `${WORKER_NAME_PREFIX}runner-${project.name.replace(
		/[^a-z0-9-]/gi,
		"_"
	)}`;
	if (testFile === undefined) {
		return name;
	}
	const testFileHash = crypto.createHash("sha1").update(testFile).digest("hex");
	testFile = testFile.replace(/[^a-z0-9-]/gi, "_");
	return `${name}-${testFileHash}-${testFile}`;
}
