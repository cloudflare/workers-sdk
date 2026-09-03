import type { WorkersKvBulkResult } from "../generated";

export const KV_BULK_REQUEST_MAX_BYTES = 100_000_000;

/**
 * Execute prepared KV mutations sequentially and report per-key failures.
 */
export async function executeKVBulkOperations<T extends { key: string }>(
	operations: T[],
	mutate: (operation: T) => Promise<void>
): Promise<WorkersKvBulkResult> {
	let successfulKeyCount = 0;
	const unsuccessfulKeys: string[] = [];

	for (const operation of operations) {
		try {
			await mutate(operation);
			successfulKeyCount++;
		} catch {
			unsuccessfulKeys.push(operation.key);
		}
	}

	return {
		successful_key_count: successfulKeyCount,
		unsuccessful_keys: unsuccessfulKeys,
	};
}
