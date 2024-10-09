/**
 * Turbo only supports caching on the individual task level, but for Wrangler's
 * e2e tests we want to support caching on a more granular basis—at the file level.
 *
 * As such, we run the `test:e2e` turbo task multiple times—once per e2e test file
 * with different arguments, ensuring that each file's tests can be cached individually.
 *
 * The intended flow here is that CI will run this file, which will trigger turbo to run
 * an individual task for each Wrangler e2e test file, using `execSync`.
 */
import { execSync } from "child_process";

// import { readdirSync } from "fs";

// Get a list of e2e test files, each of which should have an associated script
// const e2eTests = readdirSync("packages/wrangler/e2e");

const tasks = new Set<string>();

for (const file of ["dev-registry.test.ts", "get-platform-proxy.test.ts"]) {
	// Ignore other files in the e2e directory (the README, for instance)
	if (file.endsWith(".test.ts")) {
		tasks.add(
			`pnpm test:e2e --log-order=stream --output-logs=new-only --summarize --filter wrangler --concurrency 1 -- run ./e2e/${file}`
		);
	}
}

for (const task of tasks.values()) {
	execSync(task, {
		stdio: "inherit",
	});
}
