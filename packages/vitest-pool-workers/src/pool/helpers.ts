import os from "node:os";
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
	if (typeof projectPath === "number") {
		return projectPath;
	} else {
		return path.relative("", projectPath);
	}
}

export function calculateAvailableThreads() {
	return os.availableParallelism ? os.availableParallelism() : os.cpus().length;
}

type Resolve = () => void;

/**
 * A generic pool that can be used to limit the number of active resources. The resources
 * are anonymous, so we don't care about their implementation. The goal is just to count
 * the number of resources in-use.

 */
export class ResourcePool {
	#maxResources: number;
	#activeResources = 0;
	#queue = [] as Resolve[];

	constructor(maxResources: number) {
		if (!Number.isInteger(maxResources) || maxResources < 1) {
			throw new Error("maxResources argument must be a positive integer");
		}
		this.#maxResources = maxResources;
	}

	get availableResourcesCount(): number {
		return this.#maxResources - this.#activeResources;
	}

	get queueSize(): number {
		return this.#queue.length;
	}

	async nextAvailableResource() {
		if (this.#activeResources < this.#maxResources) {
			this.#activeResources++;
			return;
		}

		return new Promise((resolve) => {
			this.#queue.push(resolve as Resolve);
		});
	}

	releaseResource() {
		if (this.#queue.length > 0) {
			const next = this.#queue.shift();
			next?.();
		} else {
			this.#activeResources--;
		}
	}
}
