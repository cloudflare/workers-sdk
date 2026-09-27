import type { WorkersKvBulkResult } from "../generated";

export interface KVBulkExecutionResult {
	result: WorkersKvBulkResult;
	error: unknown | undefined;
}

/**
 * Execute prepared KV mutations concurrently and report per-key failures.
 */
export async function executeKVBulkOperations<T extends { key: string }>(
	operations: T[],
	mutate: (operation: T) => Promise<void>
): Promise<KVBulkExecutionResult> {
	const failures: Array<{ key: string; error: unknown }> = [];
	await Promise.all(
		operations.map((operation) =>
			mutate(operation).catch((error: unknown) => {
				failures.push({ key: operation.key, error });
			})
		)
	);
	const unsuccessfulKeys = failures.map(({ key }) => key).sort();

	return {
		result: {
			successful_key_count: operations.length - unsuccessfulKeys.length,
			unsuccessful_keys: unsuccessfulKeys,
		},
		error: failures[0]?.error,
	};
}
