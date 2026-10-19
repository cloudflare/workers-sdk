import assert from "node:assert";
import type {
	ParsedInputWorkerConfig,
	ParsedOutputWorkerConfig,
} from "@cloudflare/config";
import type { ContainerDevRuntimeOptions } from "@cloudflare/containers-shared";
import type { WorkerOptions } from "miniflare";

type MiniflareExports = NonNullable<WorkerOptions["config"]["exports"]>;

/**
 * Replaces authored Container names on Durable Object exports with workerd's
 * local Container runtime metadata.
 *
 * @param options - Worker exports and their planned local Container metadata.
 * @returns Exports accepted by Miniflare's native Worker config schema.
 */
export function createMiniflareExports(options: {
	exports:
		| ParsedInputWorkerConfig["exports"]
		| ParsedOutputWorkerConfig["exports"];
	containerRuntimeOptions: Map<string, ContainerDevRuntimeOptions> | undefined;
}): MiniflareExports {
	const workerExports: MiniflareExports = {};
	for (const [name, workerExport] of Object.entries(options.exports ?? {})) {
		if (workerExport.type === "durable-object" && "storage" in workerExport) {
			const containerName =
				"container" in workerExport ? workerExport.container : undefined;
			const container =
				containerName === undefined
					? undefined
					: options.containerRuntimeOptions?.get(name);
			assert(
				containerName === undefined || container !== undefined,
				`Expected runtime options for Container-backed Durable Object export "${name}".`
			);
			workerExports[name] = { ...workerExport, container };
		} else {
			workerExports[name] = workerExport;
		}
	}
	return workerExports;
}
