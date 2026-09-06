import type {
	DurableObjectExport,
	Exports,
	WorkerEntrypointExport,
} from "./environment";

export type ExportType = Exports[string]["type"];

export interface PartitionedExports {
	"durable-object": Record<string, DurableObjectExport>;
	worker: Record<string, WorkerEntrypointExport>;
}

/**
 * Entries with an unknown `type`, and entries that are not objects at all, are
 * reported by config validation. This lets us skip them rather than crash, so
 * that callers can run against a config that has failed validation.
 */
function hasKnownExportType(entry: unknown): entry is Exports[string] {
	const type = (entry as Exports[string] | null | undefined)?.type;
	return type === "durable-object" || type === "worker";
}

export function partitionExports(
	exports: Exports | undefined
): PartitionedExports {
	const partitioned: PartitionedExports = {
		"durable-object": {},
		worker: {},
	};

	if (exports === undefined) {
		return partitioned;
	}

	for (const [name, entry] of Object.entries(exports)) {
		if (!hasKnownExportType(entry)) {
			continue;
		}
		partitioned[entry.type][name] = entry;
	}

	return partitioned;
}
