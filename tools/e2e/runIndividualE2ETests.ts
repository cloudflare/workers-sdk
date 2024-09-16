/**
 * Turbo only supports caching on the individual task level, but for C3's
 * e2e tests we want to support caching on a more granular basis—at the file level & test level.
 *
 * As such, we run the `test:e2e` turbo task multiple times—once per e2e test file, and once per framework test
 * with different arguments, ensuring that each file's tests can be cached individually.
 *
 * The intended flow here is that CI will run this file, which will trigger turbo to run
 * an individual task for each C3 e2e test file & test, using `execSync`.
 */
import { execSync } from "child_process";
import { readdirSync } from "fs";
import { frameworks } from "../../packages/create-cloudflare/e2e-tests/definitions";

// Get a list of e2e test files, each of which should have an associated script
const e2eTests = readdirSync("packages/create-cloudflare/e2e-tests");

const tasks = new Set<string>();

for (const file of e2eTests) {
	if (file === "frameworks.test.ts") {
		for (const framework of frameworks) {
			tasks.add(
				`pnpm test:e2e --log-order=stream --summarize --filter create-cloudflare --concurrency 1 -- run ./e2e-tests/${file} -t ${framework}`
			);
		}
	} else if (file.endsWith(".test.ts")) {
		tasks.add(
			`pnpm test:e2e --log-order=stream --summarize --filter create-cloudflare --concurrency 1 -- run ./e2e-tests/${file}`
		);
	}
}

for (const task of tasks.values()) {
	execSync(task, {
		stdio: "inherit",
	});
}
