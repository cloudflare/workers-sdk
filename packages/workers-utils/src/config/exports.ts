import type {
	DurableObjectExport,
	Exports,
	WorkerEntrypointExport,
	WorkflowExport,
} from "./environment";

export type ExportType = Exports[string]["type"];

export interface PartitionedExports {
	"durable-object": Record<string, DurableObjectExport>;
	worker: Record<string, WorkerEntrypointExport>;
	workflow: Record<string, WorkflowExport>;
}

export function partitionExports(
	exports: Exports | undefined
): PartitionedExports {
	const partitioned: PartitionedExports = {
		"durable-object": {},
		worker: {},
		workflow: {},
	};

	if (exports === undefined) {
		return partitioned;
	}

	for (const [name, entry] of Object.entries(exports)) {
		partitioned[entry.type][name] = entry;
	}

	return partitioned;
}
