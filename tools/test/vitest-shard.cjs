// eslint-disable-next-line @typescript-eslint/no-require-imports -- CommonJS supports both esbuild-register scripts and native Vitest config loading
const assert = require("node:assert");

/**
 * Parse CI's optional shard selection without changing local test defaults.
 * Invalid shard settings fail rather than silently dropping test coverage.
 *
 * @param {string | undefined} shard One-based index/count; defaults to CI_TEST_SHARD.
 * @returns {string | undefined} Vitest's shard option, or undefined for the complete suite.
 */
function getVitestShard(shard = process.env.CI_TEST_SHARD) {
	if (shard === undefined) {
		return undefined;
	}
	parseTestShard(shard);
	return shard;
}

/**
 * Validate a shard selection before using it to partition tests.
 *
 * @param {string} shard One-based index/count.
 * @returns {{ index: number, count: number }} The validated index and count.
 */
function parseTestShard(shard) {
	assert(/^\d+\/\d+$/.test(shard), "Expected shard=<index>/<count>");
	const [index, count] = shard.split("/").map(Number);
	assert(Number.isSafeInteger(count) && count > 0, "Invalid shard count");
	assert(
		Number.isSafeInteger(index) && index > 0 && index <= count,
		"Shard index must be between 1 and the shard count"
	);
	return { index, count };
}

exports.getVitestShard = getVitestShard;
exports.parseTestShard = parseTestShard;
