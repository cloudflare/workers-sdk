import path from "node:path";
import type { WorkspaceProject } from "vitest/node";

// User worker names must not start with this
export const WORKER_NAME_PREFIX = "vitest-pool-workers-";

export function isFileNotFoundError(e: unknown): boolean {
	return (
		typeof e === "object" && e !== null && "code" in e && e.code === "ENOENT"
	);
}

export function getProjectPath(project: WorkspaceProject): string | number {
	return project.config.config ?? project.path;
}

export function getRelativeProjectPath(
	project: WorkspaceProject
): string | number {
	const projectPath = getProjectPath(project);
	if (typeof projectPath === "number") return projectPath;
	else return path.relative("", projectPath);
}
