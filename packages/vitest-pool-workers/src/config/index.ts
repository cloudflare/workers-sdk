import type { WorkersProjectOptions } from "../pool/config";
import type { Awaitable, inject } from "vitest";

export interface WorkerPoolOptionsContext {
	// For accessing values from `globalSetup()` (e.g. ports servers started on)
	// in Miniflare options (e.g. bindings, upstream, hyperdrives, ...)
	inject: typeof inject;
}

export function defineWorkersPoolOptions(
	options:
		| WorkersProjectOptions
		| ((ctx: WorkerPoolOptionsContext) => Awaitable<WorkersProjectOptions>)
) {
	return options;
}

// TODO(soon): runD1Migrations()
// TODO(soon): getPagesASSETSBinding()

export { kCurrentWorker } from "miniflare";
