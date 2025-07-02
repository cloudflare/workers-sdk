// Turbo's env var linting isn't very sophisticated.
// This file adds environment variables that are declared in Wrangler's turbo.json
/* eslint-disable turbo/no-undeclared-env-vars */

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
import { readdirSync } from "fs";

// Get a list of e2e test files, each of which should have an associated script
const e2eTests = readdirSync("packages/wrangler/e2e");

const tasks = new Set<string>();

for (const file of e2eTests) {
	// Ignore other files in the e2e directory (the README, for instance)
	if (file.endsWith(".test.ts")) {
		tasks.add(`e2e/${file}`);
	}
}

const failed: string[] = [];

// If the user passes arguments to this script, use those to configure Vitest rather than running each test file individually
const hasCustomVitestArguments = process.argv[2];

const commandSuffix = hasCustomVitestArguments
	? ` -- --no-file-parallelism ${process.argv.slice(2).join(" ")}`
	: "";
const command = `pnpm test:e2e --log-order=stream --output-logs=new-only --summarize --filter wrangler${commandSuffix}`;

// Add the default environment configuration for E2E tests.
// Most of these rely on Turbo being set up correctly to build Wrangler & C3:
// https://github.com/cloudflare/workers-sdk/tree/main/packages/wrangler/turbo.json#L61-L62
process.env.WRANGLER ??= `node --no-warnings ${process.cwd()}/packages/wrangler/bin/wrangler.js`;
process.env.WRANGLER_IMPORT ??= `${process.cwd()}/packages/wrangler/wrangler-dist/cli.js`;
process.env.MINIFLARE_IMPORT ??= `${process.cwd()}/packages/miniflare/dist/src/index.js`;

if (hasCustomVitestArguments) {
	execSync(command, {
		stdio: "inherit",
		env: { ...process.env },
	});
	process.exit(0);
}
for (const file of tasks) {
	console.log("::group::Testing: " + file);
	try {
		execSync(command, {
			stdio: "inherit",
			env: { ...process.env, WRANGLER_E2E_TEST_FILE: file },
		});
	} catch {
		console.error("Task failed - retrying");
		try {
			execSync(command, {
				stdio: "inherit",
				env: { ...process.env, WRANGLER_E2E_TEST_FILE: file },
			});
		} catch (e) {
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
