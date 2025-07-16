import { execSync } from "child_process";
import { readdirSync } from "fs";
import type { ExecSyncOptionsWithBufferEncoding } from "child_process";

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

const extraParamsIndex = process.argv.indexOf("--");
const extraParams =
	extraParamsIndex === -1 ? [] : process.argv.slice(extraParamsIndex);
const command =
	`pnpm test:e2e --log-order=stream --output-logs=new-only --summarize --filter wrangler ` +
	extraParams.join(" ");

const failed: string[] = [];
for (const file of readdirSync("packages/wrangler/e2e")) {
	if (!file.endsWith(".test.ts")) {
		// Ignore other files in the e2e directory (the README, for instance)
		continue;
	}

	const WRANGLER_E2E_TEST_FILE = `e2e/${file}`;
	const options: ExecSyncOptionsWithBufferEncoding = {
		stdio: "inherit",
		env: { ...process.env, WRANGLER_E2E_TEST_FILE },
	};

	console.log("::group::Testing: " + WRANGLER_E2E_TEST_FILE);
	try {
		execSync(command, options);
	} catch {
		console.error("Task failed - retrying");
		try {
			execSync(command, options);
		} catch {
			console.error("Still failed, moving on");
			failed.push(file);
		}
	}
	console.log("::endgroup::");
}

if (failed.length > 0) {
	throw new Error(
		"At least one task failed (even on retry):" +
			failed.map((file) => `\n - ${file}`)
	);
}
