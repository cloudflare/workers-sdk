import assert from "node:assert";
import { parseTestShard } from "../../../../tools/test/vitest-shard.cjs";

/**
 * Partition framework cases rather than files: all cases live in one Vitest file.
 * Sort by name so reordering the configuration cannot change shard membership.
 *
 * @param tests Eligible framework cases, after applying the local framework filter.
 * @param shard Optional one-based index/count. Omit to run the complete selection.
 * @returns The cases assigned to this shard, including newly added frameworks.
 */
export function selectFrameworkTests<Test extends { name: string }>(
	tests: Test[],
	shard: string | undefined
): Test[] {
	if (shard === undefined) {
		return tests;
	}
	const { index, count } = parseTestShard(shard);
	return [...tests]
		.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
		.filter((_, position) => position % count === index - 1);
}

/**
 * Bound whole-test retries while allowing per-case and local overrides.
 *
 * @param retry Optional per-case retry allowance.
 * @param override Optional E2E_TEST_RETRIES value; zero disables all retries.
 * @returns A non-negative integer retry allowance, defaulting to one.
 */
export function getFrameworkTestRetries(
	retry: number | undefined,
	override: string | undefined
): number {
	if (override === undefined) {
		return retry ?? 1;
	}
	const retries = Number(override);
	assert(
		/^\d+$/.test(override) && Number.isSafeInteger(retries),
		"E2E_TEST_RETRIES must be a non-negative integer"
	);
	return retries;
}
