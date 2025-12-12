import path from "node:path";
import type { TestProject } from "vitest/node";

// User worker names must not start with this
export const WORKER_NAME_PREFIX = "vitest-pool-workers-";

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
