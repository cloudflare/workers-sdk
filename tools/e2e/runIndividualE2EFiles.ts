import assert from "node:assert";
import { execSync } from "node:child_process";
import { statSync } from "node:fs";
import path from "node:path";
import { globSync } from "tinyglobby";
import type { ExecSyncOptionsWithBufferEncoding } from "node:child_process";

// Turbo only supports caching on the individual task level, but for Wrangler's
// e2e tests we want to support caching on a more granular basis - at the file level.
//
// As such, we run the `test:e2e` turbo task multiple times — once per e2e test file so that each file's tests can be cached individually.
// We use the `WRANGLER_E2E_TEST_FILE` environment variable to pass the specific test file to the e2e test runner so that it reuses the cached build tasks.
// If you use a command line argument to do this turbo will create a different cache key for the build tasks.
//
// The intended flow here is that CI will run this file, which will trigger turbo to run
// an individual task for each Wrangler e2e test file, using `execSync`.
//
// Any params after a `--` will be passed to the Vitest runner, so you can use this to configure the test run.
// For example to update the snapshots for all Wrangler e2e tests, you can run:
//
// ```bash
// pnpm test:e2e:wrangler -- -u
// ```
//
// ## Sharding
//
// Set `E2E_SHARD` and `E2E_SHARD_COUNT` to split the test files across multiple
// CI jobs. Each shard gets a subset of files, balanced by estimated test duration
// using greedy bin-packing. For example:
//
//   E2E_SHARD=1 E2E_SHARD_COUNT=4 pnpm test:e2e:wrangler
//
// runs the first shard's files. When unset, all files run (no sharding).

const RETRIES = 4;

const extraParamsIndex = process.argv.indexOf("--");
const extraParams =
	extraParamsIndex === -1 ? [] : process.argv.slice(extraParamsIndex);
const command =
	`pnpm test:e2e --log-order=stream --output-logs=new-only --summarize --filter wrangler ` +
	extraParams.join(" ");

const wranglerPath = path.join(__dirname, "../../packages/wrangler");
assert(statSync(wranglerPath).isDirectory());

let tests = globSync("e2e/**/*.test.ts", {
	cwd: wranglerPath,
});

// Apply sharding if E2E_SHARD and E2E_SHARD_COUNT are set.
// Uses greedy bin-packing by estimated duration so shards are roughly balanced.
// Files not in the duration map get a default estimate.
const shardIndex = process.env.E2E_SHARD
	? parseInt(process.env.E2E_SHARD, 10)
	: undefined;
const shardCount = process.env.E2E_SHARD_COUNT
	? parseInt(process.env.E2E_SHARD_COUNT, 10)
	: undefined;

if (shardIndex !== undefined && shardCount !== undefined) {
	assert(shardCount >= 1, `E2E_SHARD_COUNT must be >= 1, got ${shardCount}`);
	assert(
		shardIndex >= 1 && shardIndex <= shardCount,
		`E2E_SHARD must be between 1 and E2E_SHARD_COUNT (${shardCount}), got ${shardIndex}`
	);

	// Estimated durations (seconds) from CI measurements (with remote tests enabled).
	// Used for load-balancing across shards. Doesn't need to be exact — just roughly
	// right. Files not listed here get a default of 30s. Update periodically from CI
	// timing data. Last calibrated: 2026-03-17 from run 23205759327.
	const estimatedDurations: Record<string, number> = {
		"e2e/dev.test.ts": 181,
		"e2e/versions.test.ts": 153,
		"e2e/remote-binding/miniflare-remote-resources.test.ts": 105,
		"e2e/provision.test.ts": 95,
		"e2e/unenv-preset/preset.test.ts": 85,
		"e2e/containers.dev.test.ts": 77,
		"e2e/deploy.test.ts": 72,
		"e2e/start-worker-auth-opts.test.ts": 61,
		"e2e/assets-multiworker.test.ts": 53,
		"e2e/remote-binding/dev-remote-bindings.test.ts": 53,
		"e2e/remote-binding/remote-bindings-api.test.ts": 51,
		"e2e/deployments.test.ts": 48,
		"e2e/remote-binding/start-worker-remote-bindings.test.ts": 38,
		"e2e/types.test.ts": 36,
		"e2e/startWorker.test.ts": 31,
		"e2e/get-platform-proxy.test.ts": 30,
		"e2e/pages-dev.test.ts": 27,
		"e2e/dev-registry.test.ts": 27,
		"e2e/c3-integration.test.ts": 25,
		"e2e/pages-deploy.test.ts": 23,
		"e2e/multiworker-dev.test.ts": 21,
		"e2e/cert.test.ts": 21,
		"e2e/secrets-store.test.ts": 18,
		"e2e/r2.test.ts": 15,
		"e2e/dev-env.test.ts": 8,
		"e2e/autoconfig/setup.test.ts": 2,
	};
	const DEFAULT_DURATION = 30;

	const getDuration = (file: string) =>
		estimatedDurations[file] ?? DEFAULT_DURATION;

	// Greedy bin-packing: sort by duration desc, assign each file to the
	// lightest shard. Produces near-optimal balance.
	const sortedByDuration = [...tests].sort(
		(a, b) => getDuration(b) - getDuration(a)
	);
	const shards: string[][] = Array.from({ length: shardCount }, () => []);
	const shardTotals = new Float64Array(shardCount);

	for (const file of sortedByDuration) {
		// Find the shard with the lowest total duration
		let minIdx = 0;
		for (let i = 1; i < shardCount; i++) {
			if (shardTotals[i] < shardTotals[minIdx]) {
				minIdx = i;
			}
		}
		shards[minIdx].push(file);
		shardTotals[minIdx] += getDuration(file);
	}

	const totalFiles = tests.length;
	tests = shards[shardIndex - 1];

	console.log(
		`Shard ${shardIndex}/${shardCount}: running ${tests.length}/${totalFiles} test files (~${Math.round(shardTotals[shardIndex - 1])}s estimated)` +
			tests.map((file) => `\n  - ${file}`).join("")
	);

	// Log all shard assignments for debugging
	for (let i = 0; i < shardCount; i++) {
		console.log(
			`  Shard ${i + 1}: ${shards[i].length} files, ~${Math.round(shardTotals[i])}s`
		);
	}
}

const failedTest = new Set<string>();

for (let i = 0; i < RETRIES; i++) {
	if (i > 0) {
		console.log(
			`Retrying ${tests.length} failed tests...` +
				tests.map((file) => `\n - ${file}`).join("")
		);
	}

	failedTest.clear();

	for (const testFile of tests) {
		const options: ExecSyncOptionsWithBufferEncoding = {
			stdio: "inherit",
			env: { ...process.env, WRANGLER_E2E_TEST_FILE: testFile },
		};

		console.log(`::group::Testing: ${testFile}`);
		try {
			execSync(command, options);
		} catch {
			failedTest.add(testFile);
		}
		console.log("::endgroup::");
	}

	if (failedTest.size === 0) {
		process.exit(0);
	}

	tests = [...failedTest];
}

if (failedTest.size > 0) {
	console.error(
		"At least one task failed (even on retry):" +
			[...failedTest].map((file) => `\n - ${file}`).join("")
	);
	process.exit(1);
}
