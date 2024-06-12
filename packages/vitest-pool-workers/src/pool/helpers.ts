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

/**
 * A generic semaphore that can be used to limit the number of active resources. The resources
 * are anonymous, so we don't care about their implementation. The goal is just to count
 * the number of resources in-use.
 */
export class Semaphore {
	#maxResources: number;
	#activeResources = 0;
	#queue = [] as Array<{
		fn: () => Promise<unknown>;
		resolve: (value: unknown) => void;
	}>;

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

	async runWith<T>(fn: () => Promise<T>): Promise<T> {
		if (this.#activeResources < this.#maxResources) {
			this.#activeResources++;
			return fn().finally(() => {
				void this.#releaseResource();
			});
		}

		return new Promise<T>((resolve) => {
			this.#queue.push({ fn, resolve: resolve as (value: unknown) => void });
		});
	}

	async #releaseResource() {
		if (this.#queue.length > 0) {
			const next = this.#queue.shift();

			if (!next) {
				return;
			}

			// Resove with the result of the callback function so that it is returned
			// to the caller of runWith.
			next.resolve(next.fn());
		} else {
			this.#activeResources--;
		}
	}
}
